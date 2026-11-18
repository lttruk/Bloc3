(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const MAX_PLACES = 10;
  const ACTUALISATION_MS = 5000;
  const etat = { demoReservations: [], minuteurListe: null, jeton: null, email: null, demo: false, jour: 0, seances: [], seance: null, places: [], tarifs: [], selection: new Map(), minuteur: null, sondage: null };
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
  async function api(chemin, options = {}) {
    const headers = { 'Content-Type': 'application/json' };
    if (etat.jeton) headers.Authorization = `Bearer ${etat.jeton}`;
    const reponse = await fetch(chemin, { ...options, headers });
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
    for (const v of ['vue-programme', 'vue-salle', 'vue-confirmation', 'vue-mes-reservations']) $(v).hidden = v !== vue;
    if (vue !== 'vue-salle') clearInterval(etat.sondage);
    if (vue !== 'vue-mes-reservations') clearInterval(etat.minuteurListe);
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
      infos.querySelector('h3').textContent = s.film.titre;
      infos.querySelector('.detail').textContent = [s.film.genre, `${s.film.dureeMinutes} min`].filter(Boolean).join(' · ');
      infos.querySelector('.pastille').textContent = s.version;
      const bouton = document.createElement('button');
      bouton.type = 'button'; bouton.className = 'bouton'; bouton.textContent = 'Choisir mes places';
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

  async function ouvrirSeance(seance) {
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
    $('btn-reserver').textContent = n === 0 ? 'Bloquer mes places' : `Bloquer ${n} place${n > 1 ? 's' : ''}`;
  }

  // ---------- Réservation ----------
  async function reserver() {
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
      if (r.statut === 'EN_ATTENTE') {
        comptes.push({ el: carte.querySelector('.reste'), fin: new Date(r.expireLe).getTime() });
        const voir = document.createElement('button');
        voir.type = 'button'; voir.className = 'bouton discret'; voir.textContent = 'Voir la séance';
        voir.addEventListener('click', () => void ouvrirSeanceParId(r.seanceId));
        const liberer = document.createElement('button');
        liberer.type = 'button'; liberer.className = 'bouton'; liberer.textContent = 'Libérer les places';
        liberer.addEventListener('click', () => void libererReservation(r.reference));
        carte.querySelector('.boutons').append(voir, liberer);
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
  $('btn-deconnexion').addEventListener('click', () => { etat.jeton = null; etat.email = null; majCompte(); afficher('vue-programme'); notifier('Vous êtes déconnecté.'); });
  $('btn-mes-reservations').addEventListener('click', () => void ouvrirMesReservations());
  $('btn-voir-mes').addEventListener('click', () => { clearInterval(etat.minuteur); void ouvrirMesReservations(); });
  $('btn-retour-mes').addEventListener('click', () => afficher('vue-programme'));
  $('onglet-connexion').addEventListener('click', () => ouvrirAuth(false));
  $('onglet-inscription').addEventListener('click', () => ouvrirAuth(true));
  $('fenetre-auth').addEventListener('click', (ev) => { if (ev.target === ev.currentTarget) ev.currentTarget.close(); });
  $('btn-retour').addEventListener('click', () => afficher('vue-programme'));
  $('btn-nouvelle').addEventListener('click', () => { clearInterval(etat.minuteur); afficher('vue-programme'); });
  $('lien-accueil').addEventListener('click', (ev) => { ev.preventDefault(); afficher('vue-programme'); });
  $('btn-reserver').addEventListener('click', () => void reserver());
  $('recherche').addEventListener('input', dessinerProgramme);

  restaurerSession();
  majCompte();
  dessinerJours();
  void chargerProgramme();
})();
