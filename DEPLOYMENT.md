# Publiceren naar Hostnet

`hostnet/.github/workflows/deploy-hostnet.yml` is de enige workflow die de website publiceert. De website-repository valideert iedere wijziging en pull request; een geslaagde validatie betekent niet dat de site al online staat.

## Publicatie

Kies in `tommyvercettiseh/hostnet` de workflow **Central Hostnet Deploy**, klik **Run workflow** en kies **website**. De centrale repository gebruikt de bestaande secrets `FTP_USERNAME` en `SSH_PRIVATE_KEY`. Er is geen extra token in de website-repository nodig.

Een wijziging van `.deploy-trigger`, de centrale configuratie of de centrale workflow start eveneens een publicatie van het daarin gekozen project. Alleen wijzigingen op `main` publiceren; pull requests valideren alleen de configuratie.

## Volledige website

De centrale workflow checkt de website-repository uit en gebruikt `scripts/deploy_hostnet.py`. Dit publiceert alle gevolgde statische bestanden, inclusief Diensten, Projects, Hypotheek, Meals, Pallet Optimizer en de bijbehorende `.htaccess`-bestanden. Rebirth wordt apart beheerd en wordt niet verwijderd.

Bestaande bestanden worden vooraf gekopieerd naar `github-deploy-backups/<run-id>-<attempt>/` naast `httpdocs`. De upload controleert hashes, verifieert de vastgelegde SSH-hostsleutel en vervangt bestanden afzonderlijk atomair. Na publicatie worden zeven routes gecontroleerd. Publicaties worden na elkaar uitgevoerd.

## Lokale controle

`python3 scripts/deploy_hostnet.py --check` valideert de publicatieset zonder serververbinding. `npm install --no-save jsdom@24.1.3` gevolgd door `node tests/meals-smoke.cjs` controleert het live dagboekgedrag.
