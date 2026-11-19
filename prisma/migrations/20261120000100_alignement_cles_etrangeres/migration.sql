-- Alignement des clés étrangères sur le schéma Prisma : ON UPDATE CASCADE (valeur par défaut de Prisma).
-- Les migrations écrites à la main ne précisaient pas ON UPDATE ; aucune clé primaire n'étant modifiée
-- par l'application, ce changement n'a pas d'effet fonctionnel mais supprime l'écart signalé par migrate dev.

-- DropForeignKey
ALTER TABLE `billet` DROP FOREIGN KEY `fk_billet_place`;

-- DropForeignKey
ALTER TABLE `billet` DROP FOREIGN KEY `fk_billet_reservation`;

-- DropForeignKey
ALTER TABLE `billet` DROP FOREIGN KEY `fk_billet_seance`;

-- DropForeignKey
ALTER TABLE `billet` DROP FOREIGN KEY `fk_billet_tarif`;

-- DropForeignKey
ALTER TABLE `jeton_rafraichissement` DROP FOREIGN KEY `fk_jeton_utilisateur`;

-- DropForeignKey
ALTER TABLE `journal_admin` DROP FOREIGN KEY `fk_journal_utilisateur`;

-- DropForeignKey
ALTER TABLE `journal_connexion` DROP FOREIGN KEY `fk_journal_connexion_utilisateur`;

-- DropForeignKey
ALTER TABLE `paiement` DROP FOREIGN KEY `fk_paiement_reservation`;

-- DropForeignKey
ALTER TABLE `place` DROP FOREIGN KEY `fk_place_salle`;

-- DropForeignKey
ALTER TABLE `reservation` DROP FOREIGN KEY `fk_reservation_seance`;

-- DropForeignKey
ALTER TABLE `reservation` DROP FOREIGN KEY `fk_reservation_utilisateur`;

-- DropForeignKey
ALTER TABLE `seance` DROP FOREIGN KEY `fk_seance_film`;

-- DropForeignKey
ALTER TABLE `seance` DROP FOREIGN KEY `fk_seance_salle`;

-- AddForeignKey
ALTER TABLE `place` ADD CONSTRAINT `fk_place_salle` FOREIGN KEY (`salle_id`) REFERENCES `salle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seance` ADD CONSTRAINT `fk_seance_film` FOREIGN KEY (`film_id`) REFERENCES `film`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `seance` ADD CONSTRAINT `fk_seance_salle` FOREIGN KEY (`salle_id`) REFERENCES `salle`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation` ADD CONSTRAINT `fk_reservation_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `reservation` ADD CONSTRAINT `fk_reservation_seance` FOREIGN KEY (`seance_id`) REFERENCES `seance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billet` ADD CONSTRAINT `fk_billet_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billet` ADD CONSTRAINT `fk_billet_seance` FOREIGN KEY (`seance_id`) REFERENCES `seance`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billet` ADD CONSTRAINT `fk_billet_place` FOREIGN KEY (`place_id`) REFERENCES `place`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `billet` ADD CONSTRAINT `fk_billet_tarif` FOREIGN KEY (`tarif_id`) REFERENCES `tarif`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `paiement` ADD CONSTRAINT `fk_paiement_reservation` FOREIGN KEY (`reservation_id`) REFERENCES `reservation`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_admin` ADD CONSTRAINT `fk_journal_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateur`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `journal_connexion` ADD CONSTRAINT `fk_journal_connexion_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateur`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `jeton_rafraichissement` ADD CONSTRAINT `fk_jeton_utilisateur` FOREIGN KEY (`utilisateur_id`) REFERENCES `utilisateur`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
