(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_PLACES = 10;
  const ACTUALISATION_MS = 5000;
  const etat = { modeGuichet: false, demoReservations: [], minuteurListe: null, jeton: null, email: null, demo: false, jour: 0, seances: [], seance: null, places: [], tarifs: [], selection: new Map(), minuteur: null, sondage: null };
  const euros = (n) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' });
  const debutJour = (decalage) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + decalage); return d; };
  const fmtDate = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'short', day: '2-digit', month: '2-digit', year: '2-digit' });
  const fmtHeure = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
  const fmtJourLong = (d) => new Date(d).toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });

  // ---------- Données fictives, utilisées seulement si l'API ne répond pas ----------
  const DEMO = (() => {
    const films = [
      { id: 1, titre: 'Hors Ligne', genre: 'Thriller', dureeMinutes: 112, classification: 'Tous publics' },
      { id: 2, titre: 'Zone Blanche', genre: 'Science-fiction', dureeMinutes: 124, classification: 'Tous publics' },
      { id: 3, titre: 'Face à Face', genre: 'Policier', dureeMinutes: 108, classification: 'Avertissement' },
      { id: 4, titre: 'Mode Avion', genre: 'Comédie', dureeMinutes: 95, classification: 'Tous publics' },
      { id: 5, titre: 'Les Algorithmes Zombies', genre: 'Horreur', dureeMinutes: 99, classification: 'Interdit aux moins de 12 ans' },
      { id: 6, titre: 'Dernière Story', genre: 'Comédie dramatique', dureeMinutes: 104, classification: 'Tous publics' },
    ];
    const salles = [{ id: 1, nom: 'Salle 1' }, { id: 2, nom: 'Salle 2' }];
    const seances = [];
    let id = 1;
    for (let j = 0; j < 7; j++) {
      [[14, 0, false], [17, 30, false], [21, 0, true]].forEach(([h, m, festival], c) => {
        salles.forEach((salle, s) => {
          const debut = debutJour(j); debut.setHours(h + s, m + s * 15);
          if (debut > new Date()) seances.push({ id: id++, debut: debut.toISOString(), version: (j + c) % 2 ? 'VO' : 'VF', festival, salle, film: films[(j + s * 3 + c) % films.length] });
        });
      });
    }
    const tarifs = [{ id: 1, libelle: 'Plein', prix: 11.5 }, { id: 2, libelle: 'Réduit', prix: 9 }, { id: 3, libelle: 'Moins de 14 ans', prix: 6.5 }, { id: 4, libelle: 'Groupe', prix: 8 }];
    const places = [];
    let p = 1;
    for (const rangee of 'ABCDEFGHIJ') for (let n = 1; n <= 12; n++) {
      const k = (p * 37) % 23;
      places.push({ id: p++, rangee, numero: n, type: rangee === 'A' && n <= 2 ? 'PMR' : 'STANDARD', statut: k === 0 || k === 5 ? 'OCCUPEE' : k === 9 ? 'EN_COURS' : 'LIBRE' });
    }
    return { seances, tarifs, places };
  })();

  // ---------- API ----------
  // US-2.2 : le jeton d'accès dure 15 minutes ; il est renouvelé en silence grâce au cookie
  // httpOnly posé à la connexion (une seule demande à la fois, même si plusieurs appels échouent).
  let renouvellement = null;
  function renouvelerSession() {
    renouvellement ??= fetch('/auth/rafraichir', { method: 'POST', credentials: 'same-origin' })
      .then(async (r) => {
        if (!r.ok) return false;
        etat.jeton = (await r.json()).accessToken;
        memoriserSession();
        return true;
      })
      .catch(() => false)
      .finally(() => { renouvellement = null; });
    return renouvellement;
  }

  async function api(chemin, options = {}, nouvelEssai = true) {
    const headers = { 'Content-Type': 'application/json' };
    if (etat.jeton) headers.Authorization = `Bearer ${etat.jeton}`;
    const reponse = await fetch(chemin, { ...options, headers });
    if (reponse.status === 401 && nouvelEssai && etat.jeton && !etat.demo && !chemin.startsWith('/auth/') && (await renouvelerSession())) {
      return api(chemin, options, false);
    }
    const corps = await reponse.json().catch(() => null);
    if (!reponse.ok) {
      const message = Array.isArray(corps?.message) ? corps.message[0] : corps?.message;
      const erreur = new Error(message || 'Une erreur est survenue.');
      erreur.status = reponse.status;
      throw erreur;
    }
    return corps;
  }

  let delaiToast;
  function notifier(message) {
    const t = $('toast');
    t.textContent = message;
    t.classList.add('visible');
    clearTimeout(delaiToast);
    delaiToast = setTimeout(() => t.classList.remove('visible'), 4000);
  }

  function afficher(vue) {
    for (const v of ['vue-programme', 'vue-salle', 'vue-confirmation', 'vue-mes-reservations', 'vue-admin', 'vue-controle', 'vue-guichet']) $(v).hidden = v !== vue;
    if (vue !== 'vue-salle') clearInterval(etat.sondage);
    if (vue !== 'vue-mes-reservations') clearInterval(etat.minuteurListe);
    if (vue !== 'vue-controle' && scan.flux) arreterCamera();
    window.scrollTo({ top: 0 });
  }

  // ---------- Affiches générées (aucune image à charger) ----------
  const PALETTES = {
    'Thriller': ['#0f2027', '#2c5364'], 'Science-fiction': ['#1a0b3b', '#3f2b96'], 'Policier': ['#141414', '#5a1a1a'],
    'Comédie': ['#f7971e', '#d4481c'], 'Horreur': ['#0b0b0b', '#3d6b1f'], 'Comédie dramatique': ['#7f2c6b', '#e0607e'],
  };
  function affiche(film) {
    const [a, b] = PALETTES[film.genre] ?? ['#2b2b2b', '#5a5a5a'];
    const div = document.createElement('div');
    div.className = 'affiche';
    div.style.setProperty('--fond-affiche', `linear-gradient(160deg, ${a}, ${b})`);
    const presente = document.createElement('div'); presente.className = 'presente'; presente.textContent = 'Le Grand Cinéma présente';
    const titre = document.createElement('div'); titre.className = 'titre-affiche'; titre.textContent = film.titre;
    const genre = document.createElement('div'); genre.className = 'genre-affiche'; genre.textContent = film.genre ?? '';
    div.append(presente, titre, genre);
    return div;
  }

  // ---------- Programme ----------
  function dessinerJours() {
    const conteneur = $('filtres');
    conteneur.replaceChildren();
    for (let j = 0; j < 7; j++) {
      const d = debutJour(j);
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'jour';
      b.setAttribute('aria-pressed', String(j === etat.jour));
      b.innerHTML = `${j === 0 ? "Aujourd'hui" : d.toLocaleDateString('fr-FR', { weekday: 'short' })}<span></span>`;
      b.querySelector('span').textContent = d.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' });
      b.addEventListener('click', () => { etat.jour = j; dessinerJours(); void chargerProgramme(); });
      conteneur.append(b);
    }
    const version = document.createElement('select');
    version.id = 'version';
    version.setAttribute('aria-label', 'Version');
    for (const [v, l] of [['', 'VF et VO'], ['VF', 'VF'], ['VO', 'VO']]) version.add(new Option(l, v, false, v === (etat.version ?? '')));
    version.addEventListener('change', () => { etat.version = version.value || undefined; void chargerProgramme(); });
    conteneur.append(version);
  }

  async function chargerProgramme() {
    const du = debutJour(etat.jour), au = debutJour(etat.jour + 1);
    try {
      if (etat.demo) throw new TypeError('démo');
      const params = new URLSearchParams({ du: du.toISOString(), au: au.toISOString() });
      if (etat.version) params.set('version', etat.version);
      etat.seances = await api(`/seances?${params}`);
    } catch (e) {
      if (e.status) { notifier(e.message); return; }
      etat.demo = true;
      $('bandeau-demo').hidden = false;
      etat.seances = DEMO.seances.filter((s) => new Date(s.debut) >= du && new Date(s.debut) < au && (!etat.version || s.version === etat.version));
    }
    dessinerProgramme();
  }

  function dessinerProgramme() {
    const filtre = $('recherche').value.trim().toLowerCase();
    const liste = etat.seances.filter((s) => !filtre || `${s.film.titre} ${s.film.genre ?? ''}`.toLowerCase().includes(filtre));
    const grille = $('grille');
    grille.replaceChildren();
    if (liste.length === 0) {
      const v = document.createElement('p'); v.className = 'aucun'; v.textContent = 'Aucune séance pour ce choix. Essayez un autre jour.';
      grille.append(v);
      return;
    }
    for (const s of liste) {
      const carte = document.createElement('article');
      carte.className = 'film';
      const aff = affiche(s.film);
      if (s.festival) { aff.classList.add('festival'); const r = document.createElement('div'); r.className = 'ruban'; r.textContent = '★ Sélection festival'; aff.append(r); }
      const infos = document.createElement('div');
      infos.className = 'infos';
      infos.innerHTML = '<div class="date"></div><h3></h3><div class="detail"></div><div class="pastille"></div>';
      infos.querySelector('.date').textContent = `${fmtDate(s.debut)} · ${fmtHeure(s.debut)} · ${s.salle.nom}`;
      const titre = document.createElement('button');
      titre.type = 'button'; titre.className = 'lien-titre'; titre.textContent = s.film.titre;
      titre.setAttribute('aria-label', `Fiche du film ${s.film.titre}`);
      titre.addEventListener('click', () => void ouvrirFiche(s.film));
      infos.querySelector('h3').append(titre);
      infos.querySelector('.detail').textContent = [s.film.genre, `${s.film.dureeMinutes} min`].filter(Boolean).join(' · ');
      infos.querySelector('.pastille').textContent = s.version;
      const lienFiche = document.createElement('button');
      lienFiche.type = 'button'; lienFiche.className = 'lien lien-fiche'; lienFiche.textContent = 'Fiche du film, bande-annonce et autres séances';
      lienFiche.addEventListener('click', () => void ouvrirFiche(s.film));
      infos.append(lienFiche);
      const bouton = document.createElement('button');
      bouton.type = 'button'; bouton.className = 'bouton'; bouton.textContent = 'Choisir mes places';
      // US-7.2 : la vente en ligne ouvre à la date fixée par l'administrateur
      if (s.ouvertureVente && new Date(s.ouvertureVente) > new Date()) {
        bouton.disabled = true;
        bouton.textContent = `Vente dès le ${fmtDate(s.ouvertureVente)} à ${fmtHeure(s.ouvertureVente)}`;
        carte.append(aff, infos, bouton);
        grille.append(carte);
        continue;
      }
      bouton.addEventListener('click', () => void ouvrirSeance(s));
      // Bouton posé sur l'affiche : même action que « Choisir mes places »
      const surAffiche = document.createElement('button');
      surAffiche.type = 'button';
      surAffiche.className = 'bouton bouton-affiche';
      surAffiche.textContent = 'Réserver';
      surAffiche.setAttribute('aria-label', `Choisir mes places pour ${s.film.titre}, ${fmtHeure(s.debut)}`);
      surAffiche.addEventListener('click', () => void ouvrirSeance(s));
      aff.append(surAffiche);
      aff.addEventListener('click', (ev) => { if (ev.target === aff || !ev.target.closest('button')) void ouvrirSeance(s); });
      carte.append(aff, infos, bouton);
      grille.append(carte);
    }
  }

  // ---------- Fiche détaillée d'un film (US-1.2) ----------
  const LIBELLES_DISPO = { DISPONIBLE: 'Places disponibles', DERNIERES_PLACES: 'Dernières places', COMPLET: 'Complet' };

  /** Adresse du lecteur intégrable (YouTube sans cookie ou Vimeo), ou null si le lien n'est pas reconnu. */
  function lecteurVideo(url) {
    let u;
    try { u = new URL(url); } catch { return null; }
    if (u.protocol !== 'https:') return null;
    const hote = u.hostname.replace(/^(www|m)\./, '');
    let id = null;
    if (hote === 'youtu.be') id = u.pathname.slice(1);
    else if (hote === 'youtube.com' || hote === 'youtube-nocookie.com') {
      id = u.pathname === '/watch' ? u.searchParams.get('v') : (/^\/(?:embed|shorts)\/([\w-]+)/.exec(u.pathname) ?? [])[1];
    }
    if (id && /^[\w-]{11}$/.test(id)) return `https://www.youtube-nocookie.com/embed/${id}`;
    let vimeo = null;
    if (hote === 'vimeo.com') vimeo = /^\/(\d+)/.exec(u.pathname);
    else if (hote === 'player.vimeo.com') vimeo = /^\/video\/(\d+)/.exec(u.pathname);
    return vimeo ? `https://player.vimeo.com/video/${vimeo[1]}` : null;
  }

  function ficheDemo(film) {
    const seances = DEMO.seances.filter((s) => s.film.id === film.id)
      .map((s) => ({ ...s, placesLibres: 100, capacite: 120, disponibilite: 'DISPONIBLE' }));
    return { ...film, synopsis: film.synopsis ?? null, bandeAnnonceUrl: null, tarifs: DEMO.tarifs, seances };
  }

  async function ouvrirFiche(film) {
    let fiche;
    try { fiche = etat.demo ? ficheDemo(film) : await api(`/films/${film.id}`); } catch (e) { notifier(e.message); return; }
    $('fiche-affiche').replaceChildren(affiche(fiche));
    $('fiche-genre').textContent = fiche.genre ?? '';
    $('fiche-titre').textContent = fiche.titre;
    $('fiche-detail').textContent = [`${fiche.dureeMinutes} min`, fiche.classification].filter(Boolean).join(' · ');
    $('fiche-synopsis').textContent = fiche.synopsis ?? 'Synopsis à venir.';
    $('fiche-tarifs').replaceChildren(...fiche.tarifs.map((t) => {
      const e = document.createElement('span');
      e.textContent = `${t.libelle} ${euros(Number(t.prix))}${t.justificatifRequis ? ' (justificatif)' : ''}`;
      return e;
    }));
    dessinerBandeAnnonce(fiche);
    dessinerSeancesFiche(fiche);
    $('fenetre-film').showModal();
  }

  function dessinerBandeAnnonce(fiche) {
    const zone = $('fiche-video');
    zone.replaceChildren();
    const lecteur = fiche.bandeAnnonceUrl ? lecteurVideo(fiche.bandeAnnonceUrl) : null;
    if (lecteur) {
      const cadre = document.createElement('iframe');
      cadre.src = lecteur;
      cadre.title = `Bande-annonce de ${fiche.titre}`;
      cadre.loading = 'lazy';
      cadre.allow = 'encrypted-media; picture-in-picture; fullscreen';
      cadre.referrerPolicy = 'strict-origin-when-cross-origin';
      zone.append(cadre);
    } else if (fiche.bandeAnnonceUrl) {
      const lien = document.createElement('a');
      lien.href = fiche.bandeAnnonceUrl; lien.target = '_blank'; lien.rel = 'noopener noreferrer';
      lien.className = 'bouton discret'; lien.textContent = 'Voir la bande-annonce';
      zone.append(lien);
    } else {
      const p = document.createElement('p'); p.className = 'doux'; p.textContent = 'Bande-annonce bientôt disponible.';
      zone.append(p);
    }
  }

  function dessinerSeancesFiche(fiche) {
    const zone = $('fiche-seances');
    zone.replaceChildren();
    if (fiche.seances.length === 0) {
      const p = document.createElement('p'); p.className = 'doux'; p.textContent = 'Aucune séance programmée pour le moment.';
      zone.append(p);
      return;
    }
    let jourCourant = '';
    for (const s of fiche.seances) {
      const jour = fmtJourLong(s.debut);
      if (jour !== jourCourant) {
        jourCourant = jour;
        const titre = document.createElement('h4'); titre.className = 'fiche-jour'; titre.textContent = jour;
        zone.append(titre);
      }
      const ligne = document.createElement('div');
      ligne.className = 'fiche-seance';
      const heure = document.createElement('span'); heure.className = 'heure'; heure.textContent = fmtHeure(s.debut);
      const quoi = document.createElement('span'); quoi.className = 'quoi';
      quoi.textContent = [s.version, s.salle.nom, s.festival ? 'Sélection festival' : ''].filter(Boolean).join(' · ');
      const dispo = document.createElement('span'); dispo.className = `dispo ${s.disponibilite}`;
      dispo.textContent = s.disponibilite === 'DERNIERES_PLACES'
        ? `${LIBELLES_DISPO.DERNIERES_PLACES} (${s.placesLibres})` : LIBELLES_DISPO[s.disponibilite];
      ligne.append(heure, quoi, dispo);
      if (s.disponibilite !== 'COMPLET') {
        const bouton = document.createElement('button');
        bouton.type = 'button'; bouton.className = 'bouton'; bouton.textContent = 'Réserver';
        bouton.setAttribute('aria-label', `Réserver la séance de ${fmtHeure(s.debut)}, ${jour}`);
        if (s.ouvertureVente && new Date(s.ouvertureVente) > new Date()) {
          bouton.disabled = true;
          bouton.textContent = `Vente dès le ${fmtDate(s.ouvertureVente)} à ${fmtHeure(s.ouvertureVente)}`;
        } else {
          bouton.addEventListener('click', () => { $('fenetre-film').close(); void ouvrirSeance({ ...s, film: fiche }); });
        }
        ligne.append(bouton);
      }
      zone.append(ligne);
    }
  }

  // ---------- Plan de salle ----------
  async function chargerPlan() {
    const plan = etat.demo ? DEMO : await api(`/seances/${etat.seance.id}/places`);
    etat.places = plan.places;
    etat.tarifs = plan.tarifs.map((t) => ({ ...t, prix: Number(t.prix) }));
    // Une place choisie qui vient d'être prise par quelqu'un d'autre est retirée de la sélection.
    for (const id of [...etat.selection.keys()]) {
      const p = etat.places.find((x) => x.id === id);
      if (!p || p.statut !== 'LIBRE') { etat.selection.delete(id); notifier(`La place ${p ? p.rangee + p.numero : ''} vient d'être prise.`); }
    }
  }

  async function ouvrirSeance(seance, { guichet = false } = {}) {
    etat.modeGuichet = guichet;
    $('bloc-guichet').hidden = !guichet;
    $('mention-panier').textContent = guichet
      ? 'Les billets sont émis dès l’encaissement, avec leur QR code.'
      : 'Vos places sont conservées 10 minutes, le temps de finaliser.';
    $('btn-retour').textContent = guichet ? '← Retour au guichet' : '← Retour à l\'affiche';
    etat.seance = seance;
    etat.selection.clear();
    try { await chargerPlan(); } catch (e) { notifier(e.message); return; }
    $('salle-surtitre').textContent = `${fmtJourLong(seance.debut)} · ${fmtHeure(seance.debut)}`;
    $('salle-titre').textContent = seance.film.titre;
    $('salle-detail').textContent = `${seance.salle.nom} · ${seance.version}${seance.festival ? ' · Sélection festival' : ''}`;
    dessinerPlan();
    majPanier();
    afficher('vue-salle');
    clearInterval(etat.sondage);
    if (!etat.demo) {
      etat.sondage = setInterval(async () => {
        try { await chargerPlan(); dessinerPlan(); majPanier(); } catch { /* nouvel essai au prochain passage */ }
      }, ACTUALISATION_MS);
    }
  }

  function dessinerPlan() {
    const plan = $('plan');
    plan.replaceChildren();
    const parRangee = new Map();
    for (const p of etat.places) { if (!parRangee.has(p.rangee)) parRangee.set(p.rangee, []); parRangee.get(p.rangee).push(p); }
    for (const [rangee, places] of parRangee) {
      places.sort((a, b) => a.numero - b.numero);
      const ligne = document.createElement('div');
      ligne.className = 'rangee';
      const lettre = () => { const l = document.createElement('span'); l.className = 'lettre'; l.textContent = rangee; return l; };
      ligne.append(lettre());
      const milieu = Math.ceil(places.length / 2);
      places.forEach((p, i) => {
        if (i === milieu) { const a = document.createElement('span'); a.className = 'allee'; ligne.append(a); }
        const s = document.createElement('button');
        const choisie = etat.selection.has(p.id);
        s.type = 'button';
        s.className = ['siege', p.type === 'PMR' && 'pmr', p.statut === 'OCCUPEE' && 'occupee', p.statut === 'EN_COURS' && 'en-cours', choisie && 'selectionne'].filter(Boolean).join(' ');
        s.textContent = p.type === 'PMR' ? '' : p.numero;
        s.disabled = p.statut !== 'LIBRE';
        const etatTexte = { LIBRE: 'libre', EN_COURS: 'en cours de réservation', OCCUPEE: 'occupée' }[p.statut];
        s.setAttribute('aria-label', `Rangée ${rangee}, place ${p.numero}${p.type === 'PMR' ? ', accès PMR' : ''}, ${etatTexte}`);
        s.setAttribute('aria-pressed', String(choisie));
        s.addEventListener('click', () => basculer(p, s));
        ligne.append(s);
      });
      ligne.append(lettre());
      plan.append(ligne);
    }
  }

  function basculer(place, bouton) {
    if (etat.selection.has(place.id)) etat.selection.delete(place.id);
    else {
      if (etat.selection.size >= MAX_PLACES) { notifier(`${MAX_PLACES} places au maximum par réservation.`); return; }
      etat.selection.set(place.id, { place, tarifId: etat.tarifs[0].id });
    }
    const choisie = etat.selection.has(place.id);
    bouton.classList.toggle('selectionne', choisie);
    bouton.setAttribute('aria-pressed', String(choisie));
    majPanier();
  }

  function majPanier() {
    const conteneur = $('lignes');
    conteneur.replaceChildren();
    if (etat.selection.size === 0) {
      const v = document.createElement('div'); v.className = 'vide'; v.textContent = 'Cliquez sur un siège libre pour l’ajouter.';
      conteneur.append(v);
    }
    let total = 0;
    for (const [id, choix] of etat.selection) {
      const tarif = etat.tarifs.find((t) => t.id === choix.tarifId) ?? etat.tarifs[0];
      total += tarif.prix;
      const ligne = document.createElement('div'); ligne.className = 'ligne';
      const nom = document.createElement('strong'); nom.textContent = `${choix.place.rangee}${choix.place.numero}`;
      const liste = document.createElement('select'); liste.setAttribute('aria-label', `Tarif de la place ${nom.textContent}`);
      for (const t of etat.tarifs) liste.add(new Option(t.libelle, t.id, false, t.id === tarif.id));
      liste.addEventListener('change', () => { etat.selection.get(id).tarifId = Number(liste.value); majPanier(); });
      const prix = document.createElement('span'); prix.className = 'prix'; prix.textContent = euros(tarif.prix);
      ligne.append(nom, liste, prix);
      conteneur.append(ligne);
    }
    $('total').textContent = euros(total);
    const n = etat.selection.size;
    $('btn-reserver').disabled = n === 0;
    if (etat.modeGuichet) $('btn-reserver').textContent = n === 0 ? 'Encaisser' : `Encaisser ${euros(total)}`;
    else $('btn-reserver').textContent = n === 0 ? 'Bloquer mes places' : `Bloquer ${n} place${n > 1 ? 's' : ''}`;
  }

  // ---------- Réservation ----------
  async function reserver() {
    if (etat.modeGuichet) { await vendreAuGuichet(); return; }
    if (!etat.jeton && !etat.demo) { ouvrirAuth(false); notifier('Connectez-vous pour réserver vos places.'); return; }
    const places = [...etat.selection.values()].map((c) => ({ placeId: c.place.id, tarifId: c.tarifId }));
    $('btn-reserver').disabled = true;
    try {
      const r = etat.demo
        ? { reference: 'DEMO' + Array.from(crypto.getRandomValues(new Uint8Array(4)), (o) => o.toString(16).padStart(2, '0')).join('').toUpperCase(), expireLe: new Date(Date.now() + 600000).toISOString() }
        : await api(`/seances/${etat.seance.id}/reservations`, { method: 'POST', body: JSON.stringify({ places }) });
      if (etat.demo) {
        etat.demoReservations.unshift({
          reference: r.reference, statut: 'EN_ATTENTE', expireLe: r.expireLe, seanceId: etat.seance.id,
          film: etat.seance.film.titre, debut: etat.seance.debut, salle: etat.seance.salle.nom, version: etat.seance.version,
          billets: [...etat.selection.values()].map((c) => ({ place: `${c.place.rangee}${c.place.numero}`, tarif: etat.tarifs.find((t) => t.id === c.tarifId).libelle, prix: etat.tarifs.find((t) => t.id === c.tarifId).prix })),
        });
        etat.demoReservations[0].total = etat.demoReservations[0].billets.reduce((s, b) => s + b.prix, 0);
      }
      confirmer(r);
    } catch (e) {
      if (e.status === 401) { etat.jeton = null; majCompte(); ouvrirAuth(false); }
      notifier(e.status === 401 ? 'Votre session a expiré : reconnectez-vous.' : e.status === 409 ? 'Une de ces places vient d’être prise : le plan a été actualisé.' : e.message);
      if (e.status === 409) { await chargerPlan().catch(() => {}); dessinerPlan(); }
      majPanier();
    }
  }

  function confirmer(r) {
    clearInterval(etat.sondage);
    const libelles = [...etat.selection.values()].map((c) => `${c.place.rangee}${c.place.numero}`).join(', ');
    $('conf-detail').textContent = `${etat.seance.film.titre} · ${fmtJourLong(etat.seance.debut)} à ${fmtHeure(etat.seance.debut)} · Places ${libelles}`;
    $('conf-reference').textContent = r.reference;
    etat.referenceAPayer = r.reference;
    clearInterval(etat.minuteur);
    const fin = new Date(r.expireLe).getTime();
    const tic = () => {
      const reste = Math.max(0, fin - Date.now());
      $('chrono').textContent = `${String(Math.floor(reste / 60000)).padStart(2, '0')}:${String(Math.floor((reste % 60000) / 1000)).padStart(2, '0')}`;
      if (reste === 0) { clearInterval(etat.minuteur); notifier('Délai écoulé : vos places ont été libérées.'); }
    };
    tic();
    etat.minuteur = setInterval(tic, 1000);
    afficher('vue-confirmation');
  }


  // ---------- Mes réservations (US-5.2) ----------
  const LIBELLES_STATUT = { EN_ATTENTE: 'En attente', CONFIRMEE: 'Confirmée', ANNULEE: 'Libérée', EXPIREE: 'Expirée' };

  async function ouvrirMesReservations() {
    if (!etat.jeton) { ouvrirAuth(false); notifier('Connectez-vous pour voir vos réservations.'); return; }
    let liste;
    try {
      liste = etat.demo ? etat.demoReservations : await api('/reservations/moi');
    } catch (e) {
      if (e.status === 401) { etat.jeton = null; majCompte(); ouvrirAuth(false); notifier('Votre session a expiré : reconnectez-vous.'); }
      else notifier(e.message);
      return;
    }
    dessinerMesReservations(liste);
    afficher('vue-mes-reservations');
  }

  function dessinerMesReservations(liste) {
    const conteneur = $('liste-reservations');
    conteneur.replaceChildren();
    clearInterval(etat.minuteurListe);
    if (liste.length === 0) {
      const v = document.createElement('p'); v.className = 'aucun'; v.textContent = 'Vous n’avez encore aucune réservation.';
      conteneur.append(v);
      return;
    }
    const comptes = [];
    for (const r of liste) {
      const carte = document.createElement('article');
      carte.className = `resa ${r.statut}`;
      carte.innerHTML = `
        <div>
          <span class="etiquette"></span>
          <h3></h3>
          <div class="quand"></div>
          <div class="places"></div>
          <div class="quand ref"></div>
        </div>
        <div class="cote">
          <div class="montant"></div>
          <div class="reste"></div>
          <div class="boutons"></div>
        </div>`;
      carte.querySelector('.etiquette').textContent = LIBELLES_STATUT[r.statut] ?? r.statut;
      carte.querySelector('h3').textContent = r.film;
      carte.querySelector('.quand').textContent = `${fmtJourLong(r.debut)} à ${fmtHeure(r.debut)} · ${r.salle} · ${r.version}`;
      const places = carte.querySelector('.places');
      places.append('Places ');
      const b = document.createElement('b'); b.textContent = r.billets.map((x) => x.place).join(', '); places.append(b);
      places.append(` · ${r.billets.map((x) => x.tarif).join(', ')}`);
      carte.querySelector('.ref').textContent = `Référence ${r.reference}`;
      carte.querySelector('.montant').textContent = euros(r.total);
      if (r.statut === 'CONFIRMEE') {
        const voirBillets = document.createElement('button');
        voirBillets.type = 'button'; voirBillets.className = 'bouton'; voirBillets.textContent = 'Mes billets';
        voirBillets.addEventListener('click', () => void ouvrirBillets(r.reference));
        carte.querySelector('.boutons').append(voirBillets);
      }
      if (r.statut === 'EN_ATTENTE') {
        comptes.push({ el: carte.querySelector('.reste'), fin: new Date(r.expireLe).getTime() });
        const voir = document.createElement('button');
        voir.type = 'button'; voir.className = 'bouton discret'; voir.textContent = 'Voir la séance';
        voir.addEventListener('click', () => void ouvrirSeanceParId(r.seanceId));
        const liberer = document.createElement('button');
        liberer.type = 'button'; liberer.className = 'bouton'; liberer.textContent = 'Libérer les places';
        liberer.addEventListener('click', () => void libererReservation(r.reference));
        const payerResa = document.createElement('button');
        payerResa.type = 'button'; payerResa.className = 'bouton'; payerResa.textContent = 'Payer';
        payerResa.addEventListener('click', () => void payer(r.reference));
        carte.querySelector('.boutons').append(voir, liberer, payerResa);
      }
      conteneur.append(carte);
    }
    if (comptes.length) {
      const tic = () => {
        let expiree = false;
        for (const c of comptes) {
          const reste = Math.max(0, c.fin - Date.now());
          c.el.textContent = `Places bloquées encore ${String(Math.floor(reste / 60000)).padStart(2, '0')}:${String(Math.floor((reste % 60000) / 1000)).padStart(2, '0')}`;
          if (reste === 0) expiree = true;
        }
        if (expiree) void ouvrirMesReservations();
      };
      tic();
      etat.minuteurListe = setInterval(tic, 1000);
    }
  }

  async function libererReservation(reference) {
    if (!window.confirm('Libérer ces places ? Elles redeviendront disponibles pour les autres spectateurs.')) return;
    try {
      if (etat.demo) {
        const r = etat.demoReservations.find((x) => x.reference === reference);
        if (r) r.statut = 'ANNULEE';
      } else {
        await api(`/reservations/${encodeURIComponent(reference)}`, { method: 'DELETE' });
      }
      notifier('Vos places ont été libérées.');
      clearInterval(etat.minuteur);
      void ouvrirMesReservations();
    } catch (e) {
      notifier(e.message);
      void ouvrirMesReservations();
    }
  }

  async function ouvrirSeanceParId(id) {
    let seance = etat.seances.find((s) => s.id === id);
    if (!seance && !etat.demo) {
      try { seance = (await api(`/seances/${id}/places`)).seance; } catch (e) { notifier(e.message); return; }
    }
    if (seance) void ouvrirSeance(seance);
  }

  // ---------- Paiement en ligne (US-4.1) ----------
  async function payer(reference) {
    if (etat.demo) { notifier('Paiement indisponible en mode démonstration.'); return; }
    try {
      const { url } = await api(`/reservations/${encodeURIComponent(reference)}/paiement`, { method: 'POST' });
      window.location.assign(url);
    } catch (e) {
      if (e.status === 401) { etat.jeton = null; majCompte(); ouvrirAuth(false); notifier('Votre session a expiré : reconnectez-vous.'); return; }
      notifier(e.message);
    }
  }

  // Retour depuis la page Stripe : l'état du paiement est vérifié par l'API, pas déduit de l'adresse.
  async function traiterRetourPaiement() {
    const params = new URLSearchParams(window.location.search);
    const retour = params.get('paiement');
    if (!retour) return;
    window.history.replaceState({}, '', window.location.pathname);
    if (!etat.jeton) { ouvrirAuth(false); notifier('Reconnectez-vous pour retrouver votre réservation.'); return; }
    if (retour === 'annule') {
      notifier('Paiement non abouti : vos places restent bloquées jusqu’à la fin du délai de 10 minutes.');
      void ouvrirMesReservations();
      return;
    }
    try {
      const r = await api('/paiements/verification', { method: 'POST', body: JSON.stringify({ sessionId: params.get('session_id') }) });
      if (r.aRembourser) notifier('Paiement reçu après la libération de vos places : il vous sera remboursé.');
      else if (r.statut === 'CONFIRMEE') notifier(`Paiement accepté : réservation ${r.reference} confirmée.`);
      else notifier('Paiement en cours de validation : actualisez vos réservations dans un instant.');
    } catch (e) {
      notifier(e.message);
    }
    void ouvrirMesReservations();
  }

  $('btn-payer').addEventListener('click', () => { if (etat.referenceAPayer) void payer(etat.referenceAPayer); });

  // ---------- Back-office : programmation des films et des séances (US-7.1) ----------
  const ROLES_PROGRAMMATION = ['PROGRAMMATION', 'ADMIN'];
  const LIBELLES_SEANCE = { PROGRAMMEE: 'Non publiée', PUBLIEE: 'Publiée', ANNULEE: 'Annulée' };
  const LIBELLES_FILM = { BROUILLON: 'Brouillon', PUBLIE: 'Publié', ARCHIVE: 'Archivé' };
  const LIBELLES_JOURNAL = { CREATION: 'Création', MODIFICATION: 'Modification', STATUT: 'Changement de statut', ANNULATION: 'Annulation', SUPPRESSION: 'Suppression' };
  const admin = { films: [], salles: [], seances: [], filmEdite: null, seanceEditee: null };

  // Le rôle est lu dans le jeton pour afficher le menu ; l'API vérifie elle-même les droits à chaque appel.
  function roleDuJeton(jeton) {
    try {
      const charge = jeton.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      return JSON.parse(atob(charge)).role ?? null;
    } catch { return null; }
  }
  const peutProgrammer = () => Boolean(etat.jeton) && !etat.demo && ROLES_PROGRAMMATION.includes(roleDuJeton(etat.jeton));

  // Conversions entre l'heure locale des champs datetime-local et l'ISO 8601 de l'API
  const versChampLocal = (iso) => { const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
  const depuisChampLocal = (valeur) => (valeur ? new Date(valeur).toISOString() : undefined);
  const fmtHoraireAdmin = (d) => `${fmtDate(d)} ${fmtHeure(d)}`;

  function cellule(ligne, contenu) {
    const td = document.createElement('td');
    if (contenu instanceof Node) td.append(contenu); else td.textContent = contenu ?? '';
    ligne.append(td);
    return td;
  }
  function pastilleStatut(statut, libelles) {
    const s = document.createElement('span'); s.className = `statut ${statut}`; s.textContent = libelles[statut] ?? statut;
    return s;
  }
  function boutonAction(texte, action, danger = false) {
    const b = document.createElement('button'); b.type = 'button'; b.textContent = texte;
    if (danger) b.className = 'danger';
    b.addEventListener('click', () => void action());
    return b;
  }
  function erreurAdmin(e) {
    if (e.status === 401) { etat.jeton = null; majCompte(); afficher('vue-programme'); ouvrirAuth(false); notifier('Votre session a expiré : reconnectez-vous.'); return; }
    if (e.status === 403) { afficher('vue-programme'); notifier('Accès réservé à l’équipe de programmation.'); return; }
    notifier(e.message);
  }

  async function ouvrirAdmin() {
    if (!peutProgrammer()) { notifier('Accès réservé à l’équipe de programmation.'); return; }
    try {
      [admin.films, admin.salles] = await Promise.all([api('/admin/films'), api('/admin/salles')]);
    } catch (e) { erreurAdmin(e); return; }
    const estAdmin = roleDuJeton(etat.jeton) === 'ADMIN';
    for (const b of document.querySelectorAll('.onglets-admin button[data-role="ADMIN"]')) b.hidden = !estAdmin;
    if (!$('filtre-admin-jour').value) $('filtre-admin-jour').value = versChampLocal(new Date().toISOString()).slice(0, 10);
    remplirListesAdmin();
    dessinerFilms();
    afficher('vue-admin');
    await chargerSeancesAdmin();
  }

  function remplirListesAdmin() {
    const film = $('form-seance').elements.filmId;
    const choixFilm = film.value;
    film.replaceChildren(...admin.films.filter((f) => f.statut !== 'ARCHIVE').map((f) => new Option(`${f.titre} (${f.dureeMinutes} min)${f.statut === 'BROUILLON' ? ' – brouillon' : ''}`, f.id)));
    if (choixFilm) film.value = choixFilm;
    const salle = $('form-seance').elements.salleId;
    const choixSalle = salle.value;
    salle.replaceChildren(...admin.salles.map((s) => new Option(`${s.nom} (${s.capacite} places)`, s.id)));
    if (choixSalle) salle.value = choixSalle;
    const filtre = $('filtre-admin-salle');
    const choixFiltre = filtre.value;
    filtre.replaceChildren(new Option('Toutes', ''), ...admin.salles.map((s) => new Option(s.nom, s.id)));
    filtre.value = choixFiltre;
  }

  function choisirOnglet(id) {
    for (const b of document.querySelectorAll('.onglets-admin button')) {
      b.setAttribute('aria-selected', String(b.dataset.onglet === id));
      $(b.dataset.onglet).hidden = b.dataset.onglet !== id;
    }
    if (id === 'admin-journal') void chargerJournal();
    if (id === 'admin-tarifs') void chargerTarifs();
    if (id === 'admin-salles') void chargerConfiguration();
  }

  // ----- Séances -----
  async function chargerSeancesAdmin() {
    const du = new Date(`${$('filtre-admin-jour').value}T00:00`);
    const au = new Date(du); au.setDate(au.getDate() + 7);
    const params = new URLSearchParams({ du: du.toISOString(), au: au.toISOString() });
    if ($('filtre-admin-salle').value) params.set('salleId', $('filtre-admin-salle').value);
    try { admin.seances = await api(`/admin/seances?${params}`); } catch (e) { erreurAdmin(e); return; }
    dessinerSeancesAdmin();
  }

  function dessinerSeancesAdmin() {
    const corps = $('table-seances').tBodies[0];
    corps.replaceChildren();
    if (admin.seances.length === 0) {
      const tr = corps.insertRow(); const td = cellule(tr, 'Aucune séance sur ces 7 jours.'); td.colSpan = 7; td.className = 'doux';
      return;
    }
    for (const s of admin.seances) {
      const tr = corps.insertRow();
      if (s.statut === 'ANNULEE') tr.className = 'annulee';
      cellule(tr, `${fmtHoraireAdmin(s.debut)} → ${fmtHeure(s.fin)}`);
      cellule(tr, s.festival ? `${s.film.titre} ★ Festival` : s.film.titre);
      cellule(tr, s.salle.nom);
      cellule(tr, s.version);
      cellule(tr, String(s.billetsActifs));
      cellule(tr, pastilleStatut(s.statut, LIBELLES_SEANCE));
      const actions = document.createElement('div'); actions.className = 'actions-ligne';
      if (s.statut !== 'ANNULEE') {
        actions.append(s.statut === 'PUBLIEE'
          ? boutonAction('Dépublier', () => statutSeance(s, 'PROGRAMMEE'))
          : boutonAction('Publier', () => statutSeance(s, 'PUBLIEE')));
        actions.append(boutonAction('Modifier', () => editerSeance(s)));
        actions.append(boutonAction('Annuler', () => annulerSeanceAdmin(s), true));
        if (s.billetsActifs === 0) actions.append(boutonAction('Supprimer', () => supprimerSeanceAdmin(s), true));
      }
      cellule(tr, actions);
    }
  }

  function editerSeance(s) {
    admin.seanceEditee = s.id;
    const f = $('form-seance').elements;
    f.filmId.value = s.film.id; f.salleId.value = s.salle.id; f.debut.value = versChampLocal(s.debut);
    f.version.value = s.version; f.festival.checked = s.festival;
    f.ouvertureVente.value = s.ouvertureVente ? versChampLocal(s.ouvertureVente) : '';
    $('titre-form-seance').textContent = `Modifier la séance du ${fmtHoraireAdmin(s.debut)}`;
    $('btn-enregistrer-seance').textContent = 'Enregistrer';
    $('btn-annuler-edition-seance').hidden = false;
    $('erreur-seance').textContent = '';
    $('form-seance').scrollIntoView({ behavior: 'smooth' });
  }

  function reinitialiserFormSeance() {
    admin.seanceEditee = null;
    const choix = { filmId: $('form-seance').elements.filmId.value, salleId: $('form-seance').elements.salleId.value };
    $('form-seance').reset();
    $('form-seance').elements.filmId.value = choix.filmId; $('form-seance').elements.salleId.value = choix.salleId;
    $('titre-form-seance').textContent = 'Programmer une séance';
    $('btn-enregistrer-seance').textContent = 'Programmer la séance';
    $('btn-annuler-edition-seance').hidden = true;
    $('erreur-seance').textContent = '';
  }

  async function enregistrerSeance(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    if (!f.debut.value) { $('erreur-seance').textContent = 'Indiquez le début de la séance.'; return; }
    const corps = {
      filmId: Number(f.filmId.value), salleId: Number(f.salleId.value), debut: depuisChampLocal(f.debut.value),
      version: f.version.value, festival: f.festival.checked,
    };
    if (f.ouvertureVente.value) corps.ouvertureVente = depuisChampLocal(f.ouvertureVente.value);
    try {
      if (admin.seanceEditee) {
        await api(`/admin/seances/${admin.seanceEditee}`, { method: 'PATCH', body: JSON.stringify(corps) });
        notifier('Séance modifiée.');
      } else {
        await api('/admin/seances', { method: 'POST', body: JSON.stringify(corps) });
        notifier('Séance programmée. Publiez-la pour l’ouvrir à la réservation.');
      }
      reinitialiserFormSeance();
      await chargerSeancesAdmin();
    } catch (e) {
      if (e.status === 401 || e.status === 403) erreurAdmin(e); else $('erreur-seance').textContent = e.message;
    }
  }

  async function statutSeance(s, statut) {
    try {
      await api(`/admin/seances/${s.id}/statut`, { method: 'PATCH', body: JSON.stringify({ statut }) });
      notifier(statut === 'PUBLIEE' ? 'Séance publiée : elle est visible et réservable.' : 'Séance dépubliée.');
      await chargerSeancesAdmin();
    } catch (e) { erreurAdmin(e); }
  }

  async function annulerSeanceAdmin(s) {
    const message = s.billetsActifs > 0
      ? `Annuler cette séance ? Ses ${s.billetsActifs} billet(s) seront invalidés et les réservations payées devront être remboursées.`
      : 'Annuler cette séance ?';
    if (!window.confirm(message)) return;
    try {
      const r = await api(`/admin/seances/${s.id}/annulation`, { method: 'POST' });
      notifier(r.remboursementsATraiter > 0 ? `Séance annulée : ${r.remboursementsATraiter} remboursement(s) à traiter.` : 'Séance annulée.');
      await chargerSeancesAdmin();
    } catch (e) { erreurAdmin(e); }
  }

  async function supprimerSeanceAdmin(s) {
    if (!window.confirm('Supprimer définitivement cette séance ?')) return;
    try {
      await api(`/admin/seances/${s.id}`, { method: 'DELETE' });
      notifier('Séance supprimée.');
      await chargerSeancesAdmin();
    } catch (e) { erreurAdmin(e); }
  }

  // ----- Films -----
  function dessinerFilms() {
    const corps = $('table-films').tBodies[0];
    corps.replaceChildren();
    for (const film of admin.films) {
      const tr = corps.insertRow();
      if (film.statut === 'ARCHIVE') tr.className = 'annulee';
      cellule(tr, film.titre);
      cellule(tr, `${film.dureeMinutes} min`);
      cellule(tr, film.genre ?? '—');
      cellule(tr, String(film.seancesAVenir));
      cellule(tr, pastilleStatut(film.statut, LIBELLES_FILM));
      const actions = document.createElement('div'); actions.className = 'actions-ligne';
      if (film.statut !== 'PUBLIE') actions.append(boutonAction('Publier', () => statutFilm(film, 'PUBLIE')));
      if (film.statut === 'PUBLIE') actions.append(boutonAction('Dépublier', () => statutFilm(film, 'BROUILLON')));
      actions.append(boutonAction('Modifier', () => editerFilm(film)));
      if (film.statut !== 'ARCHIVE') actions.append(boutonAction('Archiver', () => statutFilm(film, 'ARCHIVE'), true));
      actions.append(boutonAction('Supprimer', () => supprimerFilmAdmin(film), true));
      cellule(tr, actions);
    }
  }

  async function rechargerFilms() {
    admin.films = await api('/admin/films');
    dessinerFilms();
    remplirListesAdmin();
  }

  function editerFilm(film) {
    admin.filmEdite = film.id;
    const f = $('form-film').elements;
    f.titre.value = film.titre; f.dureeMinutes.value = film.dureeMinutes; f.genre.value = film.genre ?? '';
    f.classification.value = film.classification ?? ''; f.synopsis.value = film.synopsis ?? '';
    f.bandeAnnonceUrl.value = film.bandeAnnonceUrl ?? '';
    $('titre-form-film').textContent = `Modifier « ${film.titre} »`;
    $('btn-enregistrer-film').textContent = 'Enregistrer';
    $('btn-annuler-edition-film').hidden = false;
    $('erreur-film').textContent = '';
    $('form-film').scrollIntoView({ behavior: 'smooth' });
  }

  function reinitialiserFormFilm() {
    admin.filmEdite = null;
    $('form-film').reset();
    $('titre-form-film').textContent = 'Ajouter un film';
    $('btn-enregistrer-film').textContent = 'Ajouter le film';
    $('btn-annuler-edition-film').hidden = true;
    $('erreur-film').textContent = '';
  }

  async function enregistrerFilm(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const corps = { titre: f.titre.value, dureeMinutes: Number(f.dureeMinutes.value) };
    for (const champ of ['genre', 'classification', 'synopsis']) if (f[champ].value.trim()) corps[champ] = f[champ].value;
    // Bande-annonce : envoyée vide en modification pour pouvoir la retirer
    if (f.bandeAnnonceUrl.value.trim() || admin.filmEdite) corps.bandeAnnonceUrl = f.bandeAnnonceUrl.value.trim();
    try {
      if (admin.filmEdite) {
        await api(`/admin/films/${admin.filmEdite}`, { method: 'PATCH', body: JSON.stringify(corps) });
        notifier('Film modifié.');
      } else {
        await api('/admin/films', { method: 'POST', body: JSON.stringify(corps) });
        notifier('Film ajouté en brouillon. Publiez-le pour l’afficher.');
      }
      reinitialiserFormFilm();
      await rechargerFilms();
    } catch (e) {
      if (e.status === 401 || e.status === 403) erreurAdmin(e); else $('erreur-film').textContent = e.message;
    }
  }

  async function statutFilm(film, statut) {
    if (statut === 'ARCHIVE' && !window.confirm(`Archiver « ${film.titre} » ? Il ne pourra plus être programmé.`)) return;
    try {
      await api(`/admin/films/${film.id}/statut`, { method: 'PATCH', body: JSON.stringify({ statut }) });
      notifier({ PUBLIE: 'Film publié.', BROUILLON: 'Film dépublié : ses séances ne sont plus visibles.', ARCHIVE: 'Film archivé.' }[statut]);
      await rechargerFilms();
    } catch (e) { erreurAdmin(e); }
  }

  async function supprimerFilmAdmin(film) {
    if (!window.confirm(`Supprimer définitivement « ${film.titre} » ?`)) return;
    try {
      await api(`/admin/films/${film.id}`, { method: 'DELETE' });
      notifier('Film supprimé.');
      await rechargerFilms();
    } catch (e) { erreurAdmin(e); }
  }

  // ----- Journal -----
  async function chargerJournal() {
    let entrees;
    try { entrees = await api('/admin/journal'); } catch (e) { erreurAdmin(e); return; }
    const corps = $('table-journal').tBodies[0];
    corps.replaceChildren();
    for (const e of entrees) {
      const tr = corps.insertRow();
      cellule(tr, fmtHoraireAdmin(e.creeLe));
      cellule(tr, e.auteur);
      cellule(tr, LIBELLES_JOURNAL[e.action] ?? e.action);
      cellule(tr, `${{ FILM: 'Film', SEANCE: 'Séance', TARIF: 'Tarif', SALLE: 'Salle' }[e.entite] ?? e.entite} n° ${e.entiteId}`);
      cellule(tr, e.details ? JSON.stringify(e.details) : '').className = 'petit doux';
    }
  }

  $('btn-admin').addEventListener('click', () => void ouvrirAdmin());
  $('btn-retour-admin').addEventListener('click', () => afficher('vue-programme'));
  for (const b of document.querySelectorAll('.onglets-admin button')) b.addEventListener('click', () => choisirOnglet(b.dataset.onglet));
  $('form-seance').addEventListener('submit', (ev) => void enregistrerSeance(ev));
  $('form-film').addEventListener('submit', (ev) => void enregistrerFilm(ev));
  $('btn-annuler-edition-seance').addEventListener('click', reinitialiserFormSeance);
  $('btn-annuler-edition-film').addEventListener('click', reinitialiserFormFilm);
  $('filtre-admin-jour').addEventListener('change', () => void chargerSeancesAdmin());
  $('filtre-admin-salle').addEventListener('change', () => void chargerSeancesAdmin());

  // ---------- Paramétrage administrateur : tarifs et salles (US-7.2) ----------
  const parametrage = { tarifEdite: null };

  async function chargerTarifs() {
    let tarifs;
    try { tarifs = await api('/admin/tarifs'); } catch (e) { erreurAdmin(e); return; }
    const corps = $('table-tarifs').tBodies[0];
    corps.replaceChildren();
    for (const t of tarifs) {
      const tr = corps.insertRow();
      if (!t.actif) tr.className = 'annulee';
      cellule(tr, t.libelle);
      cellule(tr, euros(t.prix));
      cellule(tr, t.justificatifRequis ? 'Oui' : 'Non');
      cellule(tr, String(t.billetsVendus));
      cellule(tr, pastilleStatut(t.actif ? 'PUBLIE' : 'ARCHIVE', { PUBLIE: 'Actif', ARCHIVE: 'Inactif' }));
      const actions = document.createElement('div'); actions.className = 'actions-ligne';
      actions.append(boutonAction('Modifier', () => editerTarif(t)));
      actions.append(t.actif
        ? boutonAction('Désactiver', () => basculerTarif(t, false), true)
        : boutonAction('Activer', () => basculerTarif(t, true)));
      cellule(tr, actions);
    }
  }

  function editerTarif(t) {
    parametrage.tarifEdite = t.id;
    const f = $('form-tarif').elements;
    f.libelle.value = t.libelle; f.prix.value = t.prix; f.justificatifRequis.checked = t.justificatifRequis;
    $('titre-form-tarif').textContent = `Modifier le tarif « ${t.libelle} »`;
    $('btn-enregistrer-tarif').textContent = 'Enregistrer';
    $('btn-annuler-edition-tarif').hidden = false;
    $('erreur-tarif').textContent = '';
  }

  function reinitialiserFormTarif() {
    parametrage.tarifEdite = null;
    $('form-tarif').reset();
    $('titre-form-tarif').textContent = 'Ajouter un tarif';
    $('btn-enregistrer-tarif').textContent = 'Ajouter le tarif';
    $('btn-annuler-edition-tarif').hidden = true;
    $('erreur-tarif').textContent = '';
  }

  async function enregistrerTarif(ev) {
    ev.preventDefault();
    const f = ev.target.elements;
    const corps = { libelle: f.libelle.value, prix: Number(f.prix.value), justificatifRequis: f.justificatifRequis.checked };
    try {
      if (parametrage.tarifEdite) await api(`/admin/tarifs/${parametrage.tarifEdite}`, { method: 'PATCH', body: JSON.stringify(corps) });
      else await api('/admin/tarifs', { method: 'POST', body: JSON.stringify(corps) });
      notifier(parametrage.tarifEdite ? 'Tarif modifié : les billets déjà vendus gardent leur prix.' : 'Tarif ajouté.');
      reinitialiserFormTarif();
      await chargerTarifs();
    } catch (e) {
      if (e.status === 401 || e.status === 403) erreurAdmin(e); else $('erreur-tarif').textContent = e.message;
    }
  }

  async function basculerTarif(t, actif) {
    try {
      await api(`/admin/tarifs/${t.id}`, { method: 'PATCH', body: JSON.stringify({ actif }) });
      notifier(actif ? `Tarif « ${t.libelle} » remis en vente.` : `Tarif « ${t.libelle} » retiré de la vente.`);
      await chargerTarifs();
    } catch (e) { erreurAdmin(e); }
  }

  async function chargerConfiguration() {
    const choix = $('config-salle');
    if (!choix.options.length) choix.replaceChildren(...admin.salles.map((s) => new Option(s.nom, s.id)));
    if (!choix.value) return;
    let config;
    try { config = await api(`/admin/salles/${choix.value}/configuration`); } catch (e) { erreurAdmin(e); return; }
    $('config-info').textContent = `Capacité actuelle : ${config.salle.capacite} places. `
      + (config.seancesAVenir > 0
        ? `Les ${config.seancesAVenir} séance(s) déjà programmée(s) gardent leur plan : la nouvelle configuration s’applique aux séances créées ensuite.`
        : 'La nouvelle configuration s’appliquera aux séances créées ensuite.');
    $('table-config').tBodies[0].replaceChildren();
    for (const r of config.rangees) ajouterRangee(r);
    $('erreur-config').textContent = '';
  }

  function ajouterRangee(r = null) {
    const corps = $('table-config').tBodies[0];
    const tr = corps.insertRow();
    const suivante = r?.rangee ?? String.fromCharCode(65 + corps.rows.length - 1);
    const champ = (type, valeur, attributs) => {
      const input = document.createElement('input');
      input.type = type; input.value = valeur;
      Object.assign(input, attributs);
      return input;
    };
    cellule(tr, champ('text', suivante, { maxLength: 2, className: 'champ-config', ariaLabel: 'Lettre de la rangée' }));
    cellule(tr, champ('number', r?.places ?? 10, { min: 1, max: 60, className: 'champ-config', ariaLabel: 'Nombre de places' }));
    cellule(tr, champ('text', (r?.pmr ?? []).join(', '), { className: 'champ-config', placeholder: 'ex. 1, 2', ariaLabel: 'Numéros des places PMR' }));
    const actions = document.createElement('div'); actions.className = 'actions-ligne';
    actions.append(boutonAction('Retirer', () => tr.remove(), true));
    cellule(tr, actions);
  }

  async function enregistrerConfiguration() {
    const rangees = [...$('table-config').tBodies[0].rows].map((tr) => {
      const [lettre, places, pmr] = tr.querySelectorAll('input');
      return {
        rangee: lettre.value.trim().toUpperCase(),
        places: Number(places.value),
        pmr: pmr.value.split(',').map((n) => n.trim()).filter(Boolean).map(Number),
      };
    });
    if (rangees.length === 0) { $('erreur-config').textContent = 'Une salle compte au moins une rangée.'; return; }
    if (!window.confirm('Enregistrer cette configuration ? Elle s’appliquera aux séances créées à partir de maintenant.')) return;
    try {
      const config = await api(`/admin/salles/${$('config-salle').value}/configuration`, { method: 'PUT', body: JSON.stringify({ rangees }) });
      notifier(`Configuration enregistrée : ${config.salle.capacite} places pour les nouvelles séances.`);
      admin.salles = await api('/admin/salles');
      await chargerConfiguration();
    } catch (e) {
      if (e.status === 401 || e.status === 403) erreurAdmin(e); else $('erreur-config').textContent = e.message;
    }
  }

  $('form-tarif').addEventListener('submit', (ev) => void enregistrerTarif(ev));
  $('btn-annuler-edition-tarif').addEventListener('click', reinitialiserFormTarif);
  $('config-salle').addEventListener('change', () => void chargerConfiguration());
  $('btn-ajouter-rangee').addEventListener('click', () => ajouterRangee());
  $('btn-enregistrer-config').addEventListener('click', () => void enregistrerConfiguration());

  // ---------- Billets dématérialisés avec QR code (US-5.1) ----------
  async function ouvrirBillets(reference) {
    let billets;
    try { billets = await api(`/reservations/${encodeURIComponent(reference)}/billets`); } catch (e) { notifier(e.message); return; }
    presenterBillets(billets, reference, 'Mes billets');
  }

  function presenterBillets(billets, reference, titre, { imprimerTous = false } = {}) {
    $('titre-billets').textContent = titre;
    $('btn-imprimer-tous').hidden = !imprimerTous;
    const liste = $('liste-billets');
    liste.replaceChildren();
    for (const b of billets) {
      const carte = document.createElement('article');
      carte.className = `billet ${b.statut}`;
      carte.innerHTML = `
        <div class="qr"></div>
        <div class="contenu">
          <div class="surtitre">Le Grand Cinéma · E-billet</div>
          <h4></h4>
          <div class="quand"></div>
          <div class="ligne-place"></div>
          <div class="titulaire"></div>
          <div class="justificatif"></div>
          <div class="etat"></div>
          <div class="boutons"></div>
        </div>`;
      // Le SVG est produit par l'API (bibliothèque qrcode) à partir du code signé.
      carte.querySelector('.qr').innerHTML = b.qrSvg;
      carte.querySelector('h4').textContent = b.film;
      carte.querySelector('.quand').textContent = `${fmtJourLong(b.debut)} à ${fmtHeure(b.debut)} · ${b.salle} · ${b.version}`;
      carte.querySelector('.ligne-place').textContent = `Place ${b.place}${b.pmr ? ' (PMR)' : ''} · ${b.tarif} · ${euros(b.prix)}`;
      carte.querySelector('.titulaire').textContent = `Titulaire : ${b.titulaire}`;
      carte.querySelector('.justificatif').textContent = b.justificatifRequis ? `Tarif ${b.tarif} : justificatif à présenter à l’entrée.` : '';
      carte.querySelector('.etat').textContent = b.statut === 'UTILISE' ? `Utilisé le ${fmtDate(b.scanneLe)} à ${fmtHeure(b.scanneLe)}` : b.statut === 'ANNULE' ? 'Billet annulé' : '';
      const telecharger = document.createElement('a');
      telecharger.className = 'bouton discret'; telecharger.textContent = 'Télécharger le QR code';
      telecharger.href = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(b.qrSvg)}`;
      telecharger.download = `billet-${reference}-${b.place}.svg`;
      const imprimer = document.createElement('button');
      imprimer.type = 'button'; imprimer.className = 'bouton discret'; imprimer.textContent = 'Imprimer';
      imprimer.addEventListener('click', () => imprimerBillet(carte));
      carte.querySelector('.boutons').append(telecharger, imprimer);
      liste.append(carte);
    }
    $('fenetre-billets').showModal();
  }

  function imprimerBillet(...cartes) {
    const fenetre = window.open('', '_blank', 'width=720,height=900');
    if (!fenetre) { notifier('Autorisez les fenêtres pour imprimer le billet.'); return; }
    fenetre.document.title = 'Billet – Le Grand Cinéma';
    const style = fenetre.document.createElement('style');
    style.textContent = 'body{font-family:Arial,sans-serif;padding:24px}.billet{display:flex;gap:24px;border:2px solid #222;padding:20px;max-width:640px}.qr svg{width:220px;height:220px}h4{font-size:22px;margin:6px 0}.surtitre{color:#b4211d;font-weight:bold;text-transform:uppercase;font-size:12px}div{margin:4px 0}';
    style.textContent += '.billet{page-break-after:always;margin-bottom:24px}';
    fenetre.document.head.append(style);
    for (const carte of cartes) {
      const copie = carte.cloneNode(true);
      copie.querySelector('.boutons').remove();
      fenetre.document.body.append(fenetre.document.importNode(copie, true));
    }
    fenetre.focus();
    fenetre.print();
  }

  $('btn-fermer-billets').addEventListener('click', () => $('fenetre-billets').close());
  $('fenetre-billets').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });

  // ---------- Contrôle des billets à l'entrée (US-6.1) ----------
  const ROLES_CONTROLE = ['CONTROLEUR', 'ADMIN'];
  const MOTIFS_SCAN = { FALSIFIE: 'Billet refusé', ANNULE: 'Billet annulé', DEJA_UTILISE: 'Déjà utilisé', AUTRE_SEANCE: 'Autre séance' };
  const scan = { flux: null, minuteur: null, dernierCode: null, dernierInstant: 0, enCours: false, effacement: null };
  const peutControler = () => Boolean(etat.jeton) && !etat.demo && ROLES_CONTROLE.includes(roleDuJeton(etat.jeton));

  async function ouvrirControle() {
    if (!peutControler()) { notifier('Accès réservé aux contrôleurs.'); return; }
    let seances;
    try { seances = await api('/controle/seances'); } catch (e) { erreurAdmin(e); return; }
    const choix = $('controle-seance');
    choix.replaceChildren(
      new Option('Toutes les séances (pas de contrôle de séance)', ''),
      ...seances.map((s) => new Option(`${fmtHeure(s.debut)} · ${s.film} · ${s.salle}`, s.id)),
    );
    if (seances.length) choix.value = String(seances[0].id);
    afficherResultat(null);
    afficher('vue-controle');
  }

  function chargerDecodeur() {
    if (window.jsQR) return Promise.resolve();
    return new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = '/vendor/jsqr/jsQR.js';
      script.onload = resolve;
      script.onerror = () => reject(new Error('Décodeur de QR code indisponible.'));
      document.head.append(script);
    });
  }

  async function demarrerCamera() {
    if (scan.flux) { arreterCamera(); return; }
    try {
      await chargerDecodeur();
      scan.flux = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
    } catch (e) {
      notifier(e.name === 'NotAllowedError' ? 'Autorisez l’accès à la caméra pour scanner.' : e.message || 'Caméra indisponible.');
      return;
    }
    const video = $('controle-video');
    video.srcObject = scan.flux;
    await video.play();
    $('btn-camera').textContent = 'Arrêter la caméra';
    $('controle-etat-camera').textContent = 'Caméra active : présentez le QR code dans le cadre';
    const toile = document.createElement('canvas');
    const contexte = toile.getContext('2d', { willReadFrequently: true });
    scan.minuteur = setInterval(() => {
      if (!video.videoWidth || scan.enCours) return;
      toile.width = video.videoWidth; toile.height = video.videoHeight;
      contexte.drawImage(video, 0, 0);
      const image = contexte.getImageData(0, 0, toile.width, toile.height);
      const lu = window.jsQR(image.data, image.width, image.height, { inversionAttempts: 'dontInvert' });
      // Un même code lu en continu n'est envoyé qu'une fois toutes les 4 secondes.
      if (lu?.data && (lu.data !== scan.dernierCode || Date.now() - scan.dernierInstant > 4000)) {
        scan.dernierCode = lu.data; scan.dernierInstant = Date.now();
        void controlerCode(lu.data);
      }
    }, 250);
  }

  function arreterCamera() {
    clearInterval(scan.minuteur);
    scan.flux?.getTracks().forEach((piste) => piste.stop());
    scan.flux = null;
    $('controle-video').srcObject = null;
    $('btn-camera').textContent = 'Démarrer la caméra';
    $('controle-etat-camera').textContent = 'Caméra arrêtée';
  }

  async function controlerCode(code) {
    scan.enCours = true;
    try {
      const corps = { code };
      if ($('controle-seance').value) corps.seanceId = Number($('controle-seance').value);
      afficherResultat(await api('/controle/scan', { method: 'POST', body: JSON.stringify(corps) }));
    } catch (e) {
      if (e.status === 401 || e.status === 403) { arreterCamera(); erreurAdmin(e); } else notifier(e.message);
    } finally {
      scan.enCours = false;
    }
  }

  function afficherResultat(r) {
    const zone = $('resultat-scan');
    clearTimeout(scan.effacement);
    zone.className = `resultat-scan ${r ? (r.valide ? 'valide' : 'refuse') : 'attente'}`;
    $('scan-verdict').textContent = r ? (r.valide ? 'Entrée autorisée' : MOTIFS_SCAN[r.motif] ?? 'Billet refusé') : 'En attente d’un billet';
    $('scan-message').textContent = r?.message ?? '';
    const infos = $('scan-infos');
    infos.replaceChildren();
    if (r?.billet) {
      const lignes = [['Film', r.billet.film], ['Séance', `${fmtDate(r.billet.debut)} ${fmtHeure(r.billet.debut)}`], ['Salle', r.billet.salle], ['Place', r.billet.place], ['Tarif', r.billet.tarif], ['Titulaire', r.billet.titulaire]];
      if (r.billet.justificatif) lignes.push(['À vérifier', `Justificatif tarif ${r.billet.justificatif}`]);
      for (const [terme, valeur] of lignes) {
        const dt = document.createElement('dt'); dt.textContent = terme;
        const dd = document.createElement('dd'); dd.textContent = valeur;
        infos.append(dt, dd);
      }
    }
    if (r) scan.effacement = setTimeout(() => afficherResultat(null), 6000);
  }

  $('btn-controle').addEventListener('click', () => void ouvrirControle());
  $('btn-retour-controle').addEventListener('click', () => { arreterCamera(); afficher('vue-programme'); });
  $('btn-camera').addEventListener('click', () => void demarrerCamera());
  $('form-code-manuel').addEventListener('submit', (ev) => {
    ev.preventDefault();
    const champ = ev.target.elements.code;
    if (champ.value.trim()) void controlerCode(champ.value.trim());
    champ.value = '';
  });

  // ---------- Guichet : vente au comptoir (US-7.3) ----------
  const ROLES_GUICHET = ['CAISSIER', 'ADMIN'];
  const MODES_PAIEMENT = { CARTE: 'carte bancaire', ESPECES: 'espèces' };
  const peutVendre = () => Boolean(etat.jeton) && !etat.demo && ROLES_GUICHET.includes(roleDuJeton(etat.jeton));

  async function ouvrirGuichet() {
    if (!peutVendre()) { notifier('Accès réservé au personnel du guichet.'); return; }
    let seances, bilan;
    try { [seances, bilan] = await Promise.all([api('/guichet/seances'), api('/guichet/bilan')]); } catch (e) { erreurAdmin(e); return; }
    etat.modeGuichet = false;
    dessinerBilan(bilan);
    const corps = $('table-guichet').tBodies[0];
    corps.replaceChildren();
    if (seances.length === 0) {
      const tr = corps.insertRow(); const td = cellule(tr, 'Aucune séance en vente sur les 7 prochains jours.'); td.colSpan = 6; td.className = 'doux';
    }
    for (const s of seances) {
      const tr = corps.insertRow();
      cellule(tr, `${fmtDate(s.debut)} ${fmtHeure(s.debut)}`);
      cellule(tr, s.film);
      cellule(tr, s.salle);
      cellule(tr, s.version);
      cellule(tr, `${s.placesLibres} / ${s.capacite}`);
      const actions = document.createElement('div'); actions.className = 'actions-ligne';
      if (s.placesLibres > 0) {
        actions.append(boutonAction('Vendre', () => ouvrirSeance(
          { id: s.id, debut: s.debut, version: s.version, festival: false, film: { titre: s.film }, salle: { nom: s.salle } },
          { guichet: true },
        )));
      } else actions.append(pastilleStatut('COMPLET', { COMPLET: 'Complet' }));
      cellule(tr, actions);
    }
    afficher('vue-guichet');
  }

  function dessinerBilan(bilan) {
    const zone = $('bilan-guichet');
    zone.replaceChildren();
    for (const c of bilan.canaux) {
      const carte = document.createElement('div'); carte.className = 'chiffre-bilan';
      const libelle = document.createElement('div'); libelle.className = 'surtitre'; libelle.textContent = c.canal === 'WEB' ? 'Vendu en ligne aujourd’hui' : 'Vendu au guichet aujourd’hui';
      const valeur = document.createElement('div'); valeur.className = 'valeur'; valeur.textContent = `${c.billets} billet${c.billets > 1 ? 's' : ''}`;
      const montant = document.createElement('div'); montant.className = 'doux'; montant.textContent = euros(c.montant);
      carte.append(libelle, valeur, montant);
      zone.append(carte);
    }
  }

  async function vendreAuGuichet() {
    const places = [...etat.selection.values()].map((c) => ({ placeId: c.place.id, tarifId: c.tarifId }));
    const modePaiement = $('mode-paiement').value;
    $('btn-reserver').disabled = true;
    try {
      const vente = await api(`/guichet/seances/${etat.seance.id}/ventes`, { method: 'POST', body: JSON.stringify({ places, modePaiement }) });
      etat.selection.clear();
      await chargerPlan().catch(() => {});
      dessinerPlan();
      majPanier();
      presenterBillets(vente.billets, vente.reference, `Vente ${vente.reference} · ${euros(vente.total)} en ${MODES_PAIEMENT[vente.modePaiement]}`, { imprimerTous: true });
      notifier('Vente enregistrée : billets prêts à imprimer.');
    } catch (e) {
      if (e.status === 401 || e.status === 403) { erreurAdmin(e); return; }
      notifier(e.status === 409 ? 'Une de ces places vient d’être vendue ailleurs : le plan a été actualisé.' : e.message);
      if (e.status === 409) { await chargerPlan().catch(() => {}); dessinerPlan(); }
      majPanier();
    }
  }

  $('btn-guichet').addEventListener('click', () => void ouvrirGuichet());
  $('btn-retour-guichet').addEventListener('click', () => afficher('vue-programme'));
  $('btn-imprimer-tous').addEventListener('click', () => imprimerBillet(...document.querySelectorAll('#liste-billets .billet')));

  // ---------- Compte ----------
  function ouvrirAuth(inscription) {
    $('onglet-connexion').setAttribute('aria-selected', String(!inscription));
    $('onglet-inscription').setAttribute('aria-selected', String(inscription));
    $('form-connexion').hidden = inscription;
    $('form-inscription').hidden = !inscription;
    $('erreur-connexion').textContent = '';
    $('erreur-inscription').textContent = '';
    if (!$('fenetre-auth').open) $('fenetre-auth').showModal();
  }

  // La session est conservée dans l'onglet (sessionStorage) pour survivre à un rechargement de la page.
  function memoriserSession() {
    try {
      if (etat.jeton && !etat.demo) sessionStorage.setItem('session', JSON.stringify({ jeton: etat.jeton, email: etat.email }));
      else sessionStorage.removeItem('session');
    } catch { /* stockage indisponible : la session reste en mémoire */ }
  }

  function restaurerSession() {
    try {
      const s = JSON.parse(sessionStorage.getItem('session') ?? 'null');
      if (s?.jeton) { etat.jeton = s.jeton; etat.email = s.email; }
    } catch { /* rien à restaurer */ }
  }

  function majCompte() {
    memoriserSession();
    $('btn-mes-reservations').hidden = !etat.jeton;
    $('btn-admin').hidden = !peutProgrammer();
    $('btn-controle').hidden = !peutControler();
    $('btn-guichet').hidden = !peutVendre();
    const connecte = Boolean(etat.jeton);
    $('utilisateur').hidden = !connecte;
    $('utilisateur').textContent = connecte ? etat.email : '';
    $('btn-connexion').hidden = connecte;
    $('btn-deconnexion').hidden = !connecte;
  }

  async function connecter(email, motDePasse) {
    if (etat.demo) { etat.jeton = 'demo'; etat.email = email; return; }
    const r = await api('/auth/connexion', { method: 'POST', body: JSON.stringify({ email, motDePasse }) });
    etat.jeton = r.accessToken;
    etat.email = String(email).trim().toLowerCase();
    try { localStorage.setItem('sessionOuverte', '1'); } catch { /* stockage indisponible */ }
  }

  function deconnecter() {
    if (etat.jeton && !etat.demo) void fetch('/auth/deconnexion', { method: 'POST', credentials: 'same-origin' }).catch(() => undefined);
    try { localStorage.removeItem('sessionOuverte'); } catch { /* stockage indisponible */ }
    etat.jeton = null; etat.email = null;
  }

  /** Nouvel onglet ou navigateur rouvert : la session reprend si le cookie est encore valide. */
  async function reprendreSession() {
    let possible = false;
    try { possible = localStorage.getItem('sessionOuverte') === '1'; } catch { /* stockage indisponible */ }
    if (etat.jeton || !possible || !(await renouvelerSession())) return;
    try { etat.email = (await api('/auth/moi')).email; } catch { /* l'e-mail s'affichera à la prochaine connexion */ }
    majCompte();
  }

  $('form-connexion').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    try { await connecter(f.get('email'), f.get('motDePasse')); $('fenetre-auth').close(); ev.target.reset(); majCompte(); notifier('Vous êtes connecté.'); }
    catch (e) { $('erreur-connexion').textContent = e.message; }
  });

  $('form-inscription').addEventListener('submit', async (ev) => {
    ev.preventDefault();
    const f = new FormData(ev.target);
    const d = { prenom: f.get('prenom'), nom: f.get('nom'), email: f.get('email'), motDePasse: f.get('motDePasse'), consentementRgpd: f.get('consentementRgpd') === 'on' };
    if (!d.consentementRgpd) { $('erreur-inscription').textContent = 'Le consentement est nécessaire pour créer un compte.'; return; }
    try {
      if (!etat.demo) await api('/auth/inscription', { method: 'POST', body: JSON.stringify(d) });
      await connecter(d.email, d.motDePasse);
      $('fenetre-auth').close(); ev.target.reset(); majCompte(); notifier('Compte créé, vous êtes connecté.');
    } catch (e) { $('erreur-inscription').textContent = e.message; }
  });

  $('btn-connexion').addEventListener('click', () => ouvrirAuth(false));
  $('btn-deconnexion').addEventListener('click', () => { deconnecter(); majCompte(); afficher('vue-programme'); notifier('Vous êtes déconnecté.'); });
  $('btn-mes-reservations').addEventListener('click', () => void ouvrirMesReservations());
  $('btn-voir-mes').addEventListener('click', () => { clearInterval(etat.minuteur); void ouvrirMesReservations(); });
  $('btn-retour-mes').addEventListener('click', () => afficher('vue-programme'));
  $('onglet-connexion').addEventListener('click', () => ouvrirAuth(false));
  $('onglet-inscription').addEventListener('click', () => ouvrirAuth(true));
  $('fenetre-auth').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
  $('btn-fermer-fiche').addEventListener('click', () => $('fenetre-film').close());
  $('fenetre-film').addEventListener('click', (ev) => {
    const r = ev.currentTarget.getBoundingClientRect();
    if (ev.clientX < r.left || ev.clientX > r.right || ev.clientY < r.top || ev.clientY > r.bottom) ev.currentTarget.close();
  });
  // La vidéo s'arrête à la fermeture de la fiche
  $('fenetre-film').addEventListener('close', () => $('fiche-video').replaceChildren());
  $('btn-retour').addEventListener('click', () => { if (etat.modeGuichet) void ouvrirGuichet(); else afficher('vue-programme'); });
  $('btn-nouvelle').addEventListener('click', () => { clearInterval(etat.minuteur); afficher('vue-programme'); });
  $('lien-accueil').addEventListener('click', (ev) => { ev.preventDefault(); afficher('vue-programme'); });
  $('btn-reserver').addEventListener('click', () => void reserver());
  $('recherche').addEventListener('input', dessinerProgramme);

  restaurerSession();
  majCompte();
  void reprendreSession();
  dessinerJours();
  void chargerProgramme();
  void traiterRetourPaiement();
})();
