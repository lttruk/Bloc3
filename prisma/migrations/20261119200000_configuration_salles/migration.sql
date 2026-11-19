-- US-7.2 : configuration des salles modulables et paramétrage des tarifs.
-- Chaque place est datée : une séance utilise la configuration de sa salle au moment de sa
-- création, donc un changement de configuration ne touche que les nouvelles séances.

ALTER TABLE place
  ADD COLUMN ajoutee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN retiree_le DATETIME NULL;

-- Les places existantes font partie de toutes les configurations passées ;
-- celles déjà désactivées n'appartiennent à aucune.
UPDATE place SET ajoutee_le = '2000-01-01 00:00:00';
UPDATE place SET retiree_le = '2000-01-01 00:00:00' WHERE active = 0;

ALTER TABLE seance ADD COLUMN creee_le DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP;

ALTER TABLE journal_admin MODIFY entite ENUM('FILM','SEANCE','TARIF','SALLE') NOT NULL;
