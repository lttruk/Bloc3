-- US-1.2 : lien vers la bande-annonce affichée sur la fiche du film
ALTER TABLE film ADD COLUMN bande_annonce_url VARCHAR(500) NULL;
