# Hessel de Vries — website

Statische homepage voor https://hesseldevries.com/. De live site draait nu nog op WordPress bij Hostnet.

## Publiceren op Hostnet

1. Download een back-up van WordPress-bestanden en database. Bewaar ook andere mappen die op het domein moeten blijven werken.
2. Test deze repository eerst in een tijdelijke map, bijvoorbeeld `/preview/`. Upload `index.html` en de hele map `assets/` samen naar die map. Test op `https://hesseldevries.com/preview/`.
3. Kijk in Mijn Hostnet of WordPress onder **Diensten → domeinnaam → Applicaties** als installatie staat. Gebruik na de test **Verwijder applicatie** voor WordPress. Let op: die actie kan bestanden in het installatiepad weghalen. Upload daarom de nieuwe site pas daarna naar de root.
4. Zoek de exacte root via **Diensten → domeinnaam → Domeinnaam → ⋯ → Root-folder wijzigen**. Upload `index.html` rechtstreeks in die map en de map `assets/` ernaast. Niet de bovenliggende repositorymap.
5. Controleer `/`, de foto's, mobiel en de netwerkfouten. Ruim de tijdelijke previewmap op wanneer alles werkt.

Als WordPress handmatig is geïnstalleerd, bestaat de knop *Verwijder applicatie* mogelijk niet. Verwijder dan pas na back-up en test de oude WordPress-bestanden en database via de juiste Hostnet-tools. Verwijder geen e-mailinstellingen of andere domeinmappen.

GitHub is de broncode. Een commit in deze repository zet niets vanzelf live bij Hostnet. Daarvoor is later een aparte SFTP-deploy nodig.

Hostnet-handleidingen:
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015898378-Wat-is-de-root-folder-van-mijn-website
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015145998-File-Manager
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015079657-Website-uploaden-en-downloaden-via-FileZilla
- https://helpdesk.hostnet.nl/hc/nl-nl/articles/360015079737-Webhosting-opnieuw-instellen
