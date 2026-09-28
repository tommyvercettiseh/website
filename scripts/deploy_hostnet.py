"""Deploy only tracked static site files; retain files managed outside GitHub."""
import argparse
import hashlib
import io
import os
from pathlib import Path, PurePosixPath
import posixpath
import stat
import subprocess
import tempfile
import urllib.request

ROOT = Path(__file__).resolve().parents[1]
DIRECTORIES = {'assets', 'diensten', 'projects', 'pallet-optimizer', 'rebirth'}
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

def deploy(files):
    import paramiko
    host, user = required_env('HOSTNET_HOST'), required_env('HOSTNET_USER')
    root_setting = required_env('HOSTNET_WEBROOT')
    private_key, known_hosts = required_env('HOSTNET_SSH_KEY'), required_env('HOSTNET_KNOWN_HOSTS')
    key = paramiko.Ed25519Key.from_private_key(io.StringIO(private_key))
    run_id = os.environ.get('GITHUB_RUN_ID', '')
    attempt = os.environ.get('GITHUB_RUN_ATTEMPT', '1')
    if not run_id.isdigit() or not attempt.isdigit():
        raise ValueError('Deploy must run from GitHub Actions')
    with tempfile.TemporaryDirectory() as temp:
        known_file = Path(temp) / 'known_hosts'
        known_file.write_text(known_hosts + '\n')
        with paramiko.SSHClient() as client:
            client.load_host_keys(str(known_file))
            client.set_missing_host_key_policy(paramiko.RejectPolicy())
            client.connect(host, port=22, username=user, pkey=key, look_for_keys=False,
                           allow_agent=False, timeout=20, banner_timeout=20, auth_timeout=20)
            with client.open_sftp() as sftp:
                root = sftp.normalize(root_setting)
                if PurePosixPath(root).name != 'httpdocs':
                    raise ValueError('Expected the verified httpdocs webroot')
                # Verify target before any remote writes.
                for name in ['index.html', '.htaccess', 'projects/index.html']:
                    if read_existing(sftp, posixpath.join(root, name)) is None:
                        raise ValueError('Target is not the existing website')
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
    args = parser.parse_args()
    files = files_to_publish()
    if args.check:
        print('Validated', len(files), 'tracked static files. No server connection made.')
    else:
        deploy(files)
