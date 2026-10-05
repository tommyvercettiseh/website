"""Deploy only tracked static site files; retain files managed outside GitHub."""
import argparse
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import posixpath
import stat
import subprocess
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = {'assets', 'diensten', 'projects', 'pallet-optimizer', 'rebirth', 'meals'}
EXTENSIONS = {'.html', '.css', '.js', '.json', '.webmanifest', '.woff', '.woff2',
              '.png', '.jpg', '.jpeg', '.webp', '.svg', '.ico', '.mp4', '.webm', '.avif'}
ROOT_FILES = {'.htaccess', 'index.html', 'robots.txt', 'sitemap.xml', 'favicon.ico', 'mobile-check.html'}

def files_to_publish():
    tracked = subprocess.check_output(['git', 'ls-files', '-z'], cwd=ROOT).decode().split('\0')
    files = []
    for name in filter(None, tracked):
        p = PurePosixPath(name)
        allowed = name in ROOT_FILES or (p.parts[0] in DIRECTORIES and p.suffix.lower() in EXTENSIONS)
        if not allowed:
            continue
        if any(part.startswith('.') for part in p.parts) and name != '.htaccess':
            raise ValueError('Hidden file in publish set')
        local = ROOT / name
        if local.is_symlink() or not local.is_file() or ROOT not in local.resolve().parents:
            raise ValueError('Unsafe file in publish set')
        files.append(name)
    for required in ['index.html', '.htaccess', 'projects/index.html', 'diensten/index.html', 'pallet-optimizer/index.html']:
        if required not in files:
            raise ValueError('Required site file missing: ' + required)
    # Assets first, entry pages and server configuration last.
    return sorted(files, key=lambda n: (n == '.htaccess', n.endswith('.html'), n))

def digest(data):
    return hashlib.sha256(data).hexdigest()

def required_env(name):
    value = os.environ.get(name, '').strip()
    if not value:
        raise ValueError('Missing deployment setting: ' + name)
    return value

def mkdirs(sftp, path, mode=0o700):
    parts = PurePosixPath(path).parts
    current = '/'
    for part in parts[1:]:
        current = posixpath.join(current, part)
        try:
            info = sftp.lstat(current)
        except FileNotFoundError:
            sftp.mkdir(current, mode=mode)
            continue
        if not stat.S_ISDIR(info.st_mode):
            raise ValueError('Remote path is not a real directory')

def read_existing(sftp, path):
    try:
        info = sftp.lstat(path)
    except FileNotFoundError:
        return None
    if not stat.S_ISREG(info.st_mode):
        raise ValueError('Refusing to overwrite non-regular remote file')
    with sftp.open(path, 'rb') as f:
        return f.read()

# SHA-256 SSHFP records verified through DNSSEC-validating DNS-over-HTTPS
# for ssh.cyz0ptrz6.service.one on 2026-09-28 (AD=true).
HOST_KEY_HASHES = {
    'ssh-ed25519': '88380087fd5d8fd1f25e4de73b3b52ea72bb8c9235232476b94af10c217d908f',
    'ecdsa-sha2-nistp256': 'f2c041954e10e11a94cd93b527446902e723ebf0e271a248d538cf0dc44edb65',
}

def connect():
    import paramiko
    host, user = required_env('HOSTNET_HOST'), required_env('HOSTNET_USER')
    if host != 'ssh.cyz0ptrz6.service.one':
        raise ValueError('Unexpected deployment host')
    private_key = required_env('HOSTNET_SSH_KEY')
    key = paramiko.Ed25519Key.from_private_key(io.StringIO(private_key))
    class PinnedHostKey(paramiko.MissingHostKeyPolicy):
        def missing_host_key(self, client, hostname, server_key):
            expected = HOST_KEY_HASHES.get(server_key.get_name())
            if not expected or digest(server_key.asbytes()) != expected:
                raise paramiko.SSHException('Host key differs from verified DNSSEC SSHFP')
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(PinnedHostKey())
    client.connect(host, port=22, username=user, pkey=key, look_for_keys=False,
                   allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
    return client

def verify_root(sftp, root):
    if PurePosixPath(root).name != 'httpdocs':
        raise ValueError('Expected the verified httpdocs webroot')
    for name in ['index.html', '.htaccess', 'projects/index.html']:
        if read_existing(sftp, posixpath.join(root, name)) is None:
            raise ValueError('Target is not the existing website')

def probe():
    with connect() as client, client.open_sftp() as sftp:
        home = sftp.normalize('.')
        print('SFTP connection and pinned server identity verified.')
        print('SFTP home:', home)
        candidates = [home, posixpath.join(home, 'webroots/sites/httpdocs'),
                      posixpath.join(posixpath.dirname(home), 'httpdocs'),
                      '/webroots/sites/httpdocs']
        for candidate in dict.fromkeys(candidates):
            try:
                root = sftp.normalize(candidate)
                verify_root(sftp, root)
                print('VERIFIED_WEBROOT=' + root)
                return
            except (FileNotFoundError, ValueError):
                continue
        print('Directories in SFTP home:', ', '.join(sorted(
            x.filename for x in sftp.listdir_attr(home) if stat.S_ISDIR(x.st_mode))))
        raise ValueError('Live webroot needs configuration; no files were changed')

def deploy(files):
    root_setting = required_env('HOSTNET_WEBROOT')
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    if not run_id.isdigit() or not attempt.isdigit():
        raise ValueError('Deploy must run from GitHub Actions')
    with connect() as client:
        with client.open_sftp() as sftp:
                root = sftp.normalize(root_setting)
                verify_root(sftp, root)
                backup = posixpath.join(posixpath.dirname(root), 'github-deploy-backups', run_id + '-' + attempt)
                changes = []
                for name in files:
                    destination = posixpath.join(root, name)
                    data = (ROOT / name).read_bytes()
                    old = read_existing(sftp, destination)
                    if old is not None and digest(old) == digest(data):
                        continue
                    changes.append((name, data, old))
                # Complete every backup before publishing the first changed file.
                for name, data, old in changes:
                    if old is not None:
                        target = posixpath.join(backup, name)
                        mkdirs(sftp, posixpath.dirname(target))
                        with sftp.open(target, 'wb') as f:
                            f.write(old)
                        if digest(read_existing(sftp, target)) != digest(old):
                            raise ValueError('Backup verification failed')
                for name, data, old in changes:
                    target = posixpath.join(root, name)
                    mkdirs(sftp, posixpath.dirname(target), mode=0o755)
                    staging = target + '.deploy-' + run_id + '.tmp'
                    with sftp.open(staging, 'wb') as f:
                        f.write(data)
                    sftp.chmod(staging, 0o644)
                    if digest(read_existing(sftp, staging)) != digest(data):
                        raise ValueError('Upload verification failed')
                    # Never remove existing files as a fallback if rename is unsupported.
                    sftp.posix_rename(staging, target)
                    print('Published:', name)
                print('Changed files:', len(changes))
    sha = os.environ.get('GITHUB_SHA', '')
    for route in ['/', '/diensten/', '/projects/', '/pallet-optimizer/', '/rebirth/']:
        request = urllib.request.Request('https://hesseldevries.com' + route + '?deploy=' + sha, method='HEAD')
        with urllib.request.urlopen(request, timeout=30) as response:
            if response.status != 200:
                raise ValueError('Live page failed verification: ' + route)
        print('Live OK:', route)

if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('--check', action='store_true')
    parser.add_argument('--probe', action='store_true')
    args = parser.parse_args()
    files = files_to_publish()
    if args.probe:
        probe()
    elif args.check:
        print('Validated', len(files), 'tracked static files. No server connection made.')
    else:
        deploy(files)
