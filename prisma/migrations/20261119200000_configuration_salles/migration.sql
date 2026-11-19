-- US-7.2 : configuration des salles modulables et paramétrage des tarifs.
-- Chaque place est datée : une séance utilise la configuration de sa salle au moment de sa
-- création, donc un changement de configuration ne touche que les nouvelles séances.

-- Les places existantes font partie de toutes les configurations passées : la colonne est
-- créée avec une date ancienne, qui s'applique aux lignes déjà présentes...
ALTER TABLE place
  ADD COLUMN ajoutee_le DATETIME NOT NULL DEFAULT '2000-01-01 00:00:00',
  ADD COLUMN retiree_le DATETIME NULL;

-- ... puis les nouvelles places sont datées à leur création.
ALTER TABLE place MODIFY ajoutee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Les places déjà désactivées n'appartiennent à aucune configuration.
UPDATE place SET retiree_le = '2000-01-01 00:00:00' WHERE active = 0;

ALTER TABLE seance ADD COLUMN creee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE journal_admin MODIFY entite ENUM('FILM','SEANCE','TARIF','SALLE') NOT NULL;
