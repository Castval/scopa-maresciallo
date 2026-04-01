// Client Scopa Maresciallo

const socket = io();

// Mapping per i nomi dei file delle carte
const NOMI_VALORI = {
  1: 'Asso',
  2: 'Due',
  3: 'Tre',
  4: 'Quattro',
  5: 'Cinque',
  6: 'Sei',
  7: 'Sette',
  8: 'Otto',
  9: 'Nove',
  10: 'Dieci'
};

const OFFSET_SEMI = {
  denari: 0,
  coppe: 10,
  spade: 20,
  bastoni: 30
};

// Genera il percorso dell'immagine per una carta
function getImmagineCarta(valore, seme) {
  const numero = OFFSET_SEMI[seme] + valore;
  const numeroStr = numero.toString().padStart(2, '0');
  const nomeValore = NOMI_VALORI[valore];
  // Nota: l'ultimo file ha "Bastoni" con B maiuscola
  const nomeSeme = (numero === 40) ? 'Bastoni' : seme;
  return `immagini/${numeroStr}_${nomeValore}_di_${nomeSeme}.jpg`;
}

// Stato locale
let statoGioco = null;
let cartaSelezionata = null;
// Sessione persistente per riconnessione
function getSessione() {
  try { return JSON.parse(sessionStorage.getItem('sessioneCorrente')); } catch { return null; }
}
function setSessione(s) {
  if (s) sessionStorage.setItem('sessioneCorrente', JSON.stringify(s));
  else sessionStorage.removeItem('sessioneCorrente');
}
let carteSelezionateTavolo = [];
let combinazioniDisponibili = [];
let puoiPosare = false;
let numGiocatoriAttesa = 2;

// Elementi DOM
const schermate = {
  lobby: document.getElementById('lobby'),
  attesa: document.getElementById('attesa'),
  gioco: document.getElementById('gioco'),
  fineRound: document.getElementById('fineRound')
};

// Mostra schermata
function mostraSchermata(nome) {
  Object.values(schermate).forEach(s => s.classList.remove('attiva'));
  schermate[nome].classList.add('attiva');
}

// Crea elemento carta
function creaCarta(carta, clickable = false, nascosta = false) {
  const div = document.createElement('div');
  div.className = 'carta';

  if (nascosta) {
    div.classList.add('dorso');
    return div;
  }

  div.classList.add(carta.seme);
  div.dataset.id = carta.id;

  // Aggiungi classe speciale per maresciallo e settebello
  if (carta.valore === 10 && carta.seme === 'spade') {
    div.classList.add('maresciallo');
  }
  if (carta.valore === 7 && carta.seme === 'denari') {
    div.classList.add('settebello');
  }

  // Usa immagine della carta
  const imgSrc = getImmagineCarta(carta.valore, carta.seme);
  div.innerHTML = `<img src="${imgSrc}" alt="${carta.valore} di ${carta.seme}">`;

  if (clickable) {
    div.addEventListener('click', () => gestisciClickCarta(carta, div));
  }

  return div;
}

// Gestisce click su carta
function gestisciClickCarta(carta, elemento) {
  // Se è una carta in mano
  if (statoGioco.manoGiocatore.some(c => c.id === carta.id)) {
    if (!statoGioco.turnoMio) {
      mostraMessaggio('Non è il tuo turno', 'errore');
      return;
    }

    // Deseleziona carta precedente
    if (cartaSelezionata) {
      document.querySelector(`.mano-carte:not(.dorso) .carta[data-id="${cartaSelezionata.id}"]`)?.classList.remove('selezionata');
    }

    // Seleziona nuova carta
    cartaSelezionata = carta;
    elemento.classList.add('selezionata');
    carteSelezionateTavolo = [];

    // Richiedi combinazioni disponibili
    socket.emit('richiediCombinazioni', carta.id);

    // Rimuovi selezioni dal tavolo
    document.querySelectorAll('#tavolo .carta').forEach(c => {
      c.classList.remove('selezionata', 'selezionabile');
    });

    document.getElementById('azioniMossa').classList.add('nascosto');
  }
  // Se è una carta sul tavolo
  else if (statoGioco.tavolo.some(c => c.id === carta.id)) {
    if (!cartaSelezionata) {
      mostraMessaggio('Prima seleziona una carta dalla tua mano', 'errore');
      return;
    }

    // Toggle selezione
    const idx = carteSelezionateTavolo.findIndex(c => c.id === carta.id);
    if (idx >= 0) {
      carteSelezionateTavolo.splice(idx, 1);
      elemento.classList.remove('selezionata');
    } else {
      carteSelezionateTavolo.push(carta);
      elemento.classList.add('selezionata');
    }

    // Mostra bottoni azione
    aggiornaBottoniAzione();
  }
}

// Aggiorna bottoni azione
function aggiornaBottoniAzione() {
  const azioni = document.getElementById('azioniMossa');
  const btnConferma = document.getElementById('btnConferma');
  const btnPosa = document.getElementById('btnPosa');

  if (carteSelezionateTavolo.length > 0) {
    azioni.classList.remove('nascosto');
    btnConferma.classList.remove('nascosto');
    btnPosa.classList.add('nascosto');
  } else if (puoiPosare && cartaSelezionata) {
    azioni.classList.remove('nascosto');
    btnConferma.classList.add('nascosto');
    btnPosa.classList.remove('nascosto');
  } else {
    if (combinazioniDisponibili.length === 0 && cartaSelezionata) {
      azioni.classList.remove('nascosto');
      btnConferma.classList.add('nascosto');
      btnPosa.classList.remove('nascosto');
    } else {
      azioni.classList.add('nascosto');
    }
  }
}

// Renderizza stato gioco
function renderizzaGioco() {
  if (!statoGioco) return;

  const is4 = statoGioco.numGiocatori === 4;

  // Info giocatori
  if (is4) {
    document.getElementById('nomeGiocatoreDisplay').textContent = statoGioco.nomeSquadra;
    document.getElementById('nomeAvversario').textContent = statoGioco.nomeSquadraAvversaria;
  } else {
    document.getElementById('nomeGiocatoreDisplay').textContent = statoGioco.nomeGiocatore;
    document.getElementById('nomeAvversario').textContent = statoGioco.nomeAvversario || 'Avversario';
  }
  document.getElementById('puntiGiocatore').textContent = statoGioco.puntiGiocatore;
  document.getElementById('puntiAvversario').textContent = statoGioco.puntiAvversario;
  document.getElementById('carteRimanenti').textContent = statoGioco.carteRimanenti;
  document.getElementById('puntiVittoriaDisplay').textContent = statoGioco.puntiVittoria || 31;

  // Turno
  const turnoIndicatore = document.getElementById('turnoIndicatore');
  if (statoGioco.turnoMio) {
    turnoIndicatore.textContent = 'Tocca a te!';
    turnoIndicatore.classList.add('mio-turno');
  } else {
    turnoIndicatore.textContent = `Turno di ${statoGioco.turnoNome}`;
    turnoIndicatore.classList.remove('mio-turno');
  }

  // Area altri giocatori (dinamica)
  renderizzaAltriGiocatori();

  // Tavolo
  const tavolo = document.getElementById('tavolo');
  tavolo.innerHTML = '';
  for (const carta of statoGioco.tavolo) {
    tavolo.appendChild(creaCarta(carta, true));
  }

  // Mano giocatore
  const manoGiocatore = document.getElementById('manoGiocatore');
  manoGiocatore.innerHTML = '';
  for (const carta of statoGioco.manoGiocatore) {
    manoGiocatore.appendChild(creaCarta(carta, true));
  }

  // Mazzo prese con scope
  renderizzaMazzoPrese();

  // Reset selezione
  cartaSelezionata = null;
  carteSelezionateTavolo = [];
  combinazioniDisponibili = [];
  puoiPosare = false;
  document.getElementById('azioniMossa').classList.add('nascosto');
}

// Renderizza area altri giocatori (avversari e compagno)
function renderizzaAltriGiocatori() {
  const container = document.getElementById('areaAvversarioContainer');
  container.innerHTML = '';

  if (!statoGioco) return;

  const altriGiocatori = statoGioco.altriGiocatori || [];

  // Container mani altri giocatori
  const maniDiv = document.createElement('div');
  maniDiv.className = 'altri-giocatori-mani';

  for (const altro of altriGiocatori) {
    const areaDiv = document.createElement('div');
    areaDiv.className = `area-altro-giocatore ${altro.tipo}`;

    const nomeDiv = document.createElement('div');
    nomeDiv.className = 'nome-altro';
    nomeDiv.textContent = altro.nome;
    if (altro.tipo === 'compagno') nomeDiv.classList.add('compagno-label');
    areaDiv.appendChild(nomeDiv);

    const manoDiv = document.createElement('div');
    manoDiv.className = 'mano-carte dorso';
    for (let i = 0; i < altro.carte; i++) {
      const carta = document.createElement('div');
      carta.className = 'carta';
      manoDiv.appendChild(carta);
    }
    areaDiv.appendChild(manoDiv);

    maniDiv.appendChild(areaDiv);
  }

  container.appendChild(maniDiv);

  // Prese avversario
  const preseDiv = document.createElement('div');
  preseDiv.className = 'area-prese avversario';
  const preseTitle = document.createElement('h4');
  preseTitle.textContent = statoGioco.numGiocatori === 4 ? 'Prese avversari' : 'Prese avversario';
  preseDiv.appendChild(preseTitle);
  const mazzoPrese = document.createElement('div');
  mazzoPrese.className = 'mazzo-prese';
  mazzoPrese.id = 'mazzoPreseAvversario';
  preseDiv.appendChild(mazzoPrese);
  container.appendChild(preseDiv);

  // Renderizza prese avversario
  renderizzaMazzoPreseAvversario();
}

// Renderizza il mazzo delle prese con scope di traverso
function renderizzaMazzoPrese() {
  const mazzoPrese = document.getElementById('mazzoPrese');
  mazzoPrese.innerHTML = '';

  if (!statoGioco) return;

  const numPrese = statoGioco.preseGiocatore;
  const scope = statoGioco.scopeGiocatore || [];

  // Se non ci sono prese, non mostrare nulla
  if (numPrese === 0 && scope.length === 0) {
    return;
  }

  // Calcola quante carte "normali" mostrare (max 3)
  const carteNormaliDaMostrare = Math.min(3, Math.max(1, numPrese - scope.length));

  // Renderizza le carte normali (dorso) impilate
  for (let i = 0; i < carteNormaliDaMostrare; i++) {
    const cartaPresa = document.createElement('div');
    cartaPresa.className = 'carta-presa';
    cartaPresa.style.top = (i * 2) + 'px';
    cartaPresa.style.left = (i * 1) + 'px';
    cartaPresa.style.zIndex = i;
    mazzoPrese.appendChild(cartaPresa);
  }

  // Mostra max 3 scope visivamente, le altre sono "nascoste" nel mazzo
  const maxScopeVisibili = 7;
  const scopeDaMostrare = scope.slice(-maxScopeVisibili); // Ultime 3 scope
  const scopeNascoste = scope.length - scopeDaMostrare.length;

  // Renderizza le scope di traverso (compatte)
  scopeDaMostrare.forEach((scopa, idx) => {
    const parti = scopa.carta.split('_');
    const valore = parseInt(parti[0]);
    const seme = parti[1];

    const cartaScopa = document.createElement('div');
    cartaScopa.className = 'carta-scopa';

    // Posiziona le scope più compattamente (15px invece di 30px)
    const baseTop = (carteNormaliDaMostrare * 2) + 5;
    cartaScopa.style.top = (baseTop + idx * 18) + 'px';
    cartaScopa.style.left = '-15px';
    cartaScopa.style.zIndex = 50 + idx;

    const imgSrc = getImmagineCarta(valore, seme);
    cartaScopa.innerHTML = `<img src="${imgSrc}" alt="${valore} di ${seme}">`;

    // Indicatore punti
    const puntiDiv = document.createElement('div');
    puntiDiv.className = 'scopa-punti';

    if (scopa.valore === 10) {
      puntiDiv.textContent = '+10';
      puntiDiv.classList.add('super');
    } else if (scopa.valore < 0) {
      puntiDiv.textContent = scopa.valore;
      puntiDiv.classList.add('negativo');
    } else {
      puntiDiv.textContent = '+' + scopa.valore;
    }

    cartaScopa.appendChild(puntiDiv);
    mazzoPrese.appendChild(cartaScopa);
  });

  // Contatore con info scope
  const contatore = document.createElement('div');
  contatore.className = 'contatore-prese';
  const totaleScope = scope.reduce((sum, s) => sum + s.valore, 0);
  if (scope.length > 0) {
    contatore.innerHTML = `${numPrese} carte<br><strong>${scope.length} scope (${totaleScope >= 0 ? '+' : ''}${totaleScope})</strong>`;
  } else {
    contatore.textContent = `${numPrese} carte`;
  }
  mazzoPrese.appendChild(contatore);
}

// Renderizza il mazzo delle prese dell'avversario
function renderizzaMazzoPreseAvversario() {
  const mazzoPrese = document.getElementById('mazzoPreseAvversario');
  mazzoPrese.innerHTML = '';

  if (!statoGioco) return;

  const numPrese = statoGioco.preseAvversario;
  const scope = statoGioco.scopeAvversario || [];

  // Se non ci sono prese, non mostrare nulla
  if (numPrese === 0 && scope.length === 0) {
    return;
  }

  // Calcola quante carte "normali" mostrare (max 3)
  const carteNormaliDaMostrare = Math.min(3, Math.max(1, numPrese - scope.length));

  // Renderizza le carte normali (dorso) impilate
  for (let i = 0; i < carteNormaliDaMostrare; i++) {
    const cartaPresa = document.createElement('div');
    cartaPresa.className = 'carta-presa';
    cartaPresa.style.top = (i * 2) + 'px';
    cartaPresa.style.left = (i * 1) + 'px';
    cartaPresa.style.zIndex = i;
    mazzoPrese.appendChild(cartaPresa);
  }

  // Mostra max 3 scope visivamente
  const maxScopeVisibili = 7;
  const scopeDaMostrare = scope.slice(-maxScopeVisibili);

  // Renderizza le scope di traverso (compatte)
  scopeDaMostrare.forEach((scopa, idx) => {
    const parti = scopa.carta.split('_');
    const valore = parseInt(parti[0]);
    const seme = parti[1];

    const cartaScopa = document.createElement('div');
    cartaScopa.className = 'carta-scopa';

    const baseTop = (carteNormaliDaMostrare * 2) + 5;
    cartaScopa.style.top = (baseTop + idx * 18) + 'px';
    cartaScopa.style.left = '-15px';
    cartaScopa.style.zIndex = 50 + idx;

    const imgSrc = getImmagineCarta(valore, seme);
    cartaScopa.innerHTML = `<img src="${imgSrc}" alt="${valore} di ${seme}">`;

    // Indicatore punti
    const puntiDiv = document.createElement('div');
    puntiDiv.className = 'scopa-punti';

    if (scopa.valore === 10) {
      puntiDiv.textContent = '+10';
      puntiDiv.classList.add('super');
    } else if (scopa.valore < 0) {
      puntiDiv.textContent = scopa.valore;
      puntiDiv.classList.add('negativo');
    } else {
      puntiDiv.textContent = '+' + scopa.valore;
    }

    cartaScopa.appendChild(puntiDiv);
    mazzoPrese.appendChild(cartaScopa);
  });

  // Contatore con info scope
  const contatore = document.createElement('div');
  contatore.className = 'contatore-prese';
  const totaleScope = scope.reduce((sum, s) => sum + s.valore, 0);
  if (scope.length > 0) {
    contatore.innerHTML = `${numPrese} carte<br><strong>${scope.length} scope (${totaleScope >= 0 ? '+' : ''}${totaleScope})</strong>`;
  } else {
    contatore.textContent = `${numPrese} carte`;
  }
  mazzoPrese.appendChild(contatore);
}

// Mostra messaggio
function mostraMessaggio(testo, tipo = '') {
  const msgLobby = document.getElementById('messaggioLobby');
  const msgGioco = document.getElementById('messaggioGioco');

  const msg = schermate.gioco.classList.contains('attiva') ? msgGioco : msgLobby;

  msg.textContent = testo;
  msg.className = 'messaggio';
  if (tipo) msg.classList.add(tipo);

  setTimeout(() => {
    msg.textContent = '';
    msg.className = 'messaggio';
  }, 3000);
}

// Aggiorna schermata attesa
function aggiornaAttesa(giocatori) {
  const container = document.getElementById('giocatoriConnessi');
  container.innerHTML = '';

  for (const g of giocatori) {
    const div = document.createElement('div');
    div.className = 'giocatore-connesso';
    div.textContent = g.nome;
    container.appendChild(div);
  }

  const mancanti = numGiocatoriAttesa - giocatori.length;
  const msg = document.getElementById('attesaMessaggio');
  if (mancanti > 0) {
    msg.textContent = `In attesa di ${mancanti} giocator${mancanti === 1 ? 'e' : 'i'}...`;
  } else {
    msg.textContent = 'Partita in partenza...';
  }
}

// Toggle regole
document.querySelector('.sezione-regole h3')?.addEventListener('click', () => {
  document.querySelector('.sezione-regole').classList.toggle('chiusa');
});

// Event listeners
document.getElementById('btnCreaStanza').addEventListener('click', () => {
  const nome = document.getElementById('nomeGiocatore').value.trim();
  if (!nome) {
    mostraMessaggio('Inserisci il tuo nome', 'errore');
    return;
  }
  const puntiVittoria = parseInt(document.getElementById('puntiVittoria').value);
  const numGiocatori = parseInt(document.querySelector('input[name="numGiocatori"]:checked').value);
  numGiocatoriAttesa = numGiocatori;
  setSessione({ nome });
  socket.emit('creaStanza', { nome, puntiVittoria, numGiocatori });
});

document.getElementById('btnUnisciti').addEventListener('click', () => {
  const nome = document.getElementById('nomeGiocatore').value.trim();
  const codice = document.getElementById('codiceStanza').value.trim().toUpperCase();

  if (!nome) {
    mostraMessaggio('Inserisci il tuo nome', 'errore');
    return;
  }
  if (!codice) {
    mostraMessaggio('Inserisci il codice stanza', 'errore');
    return;
  }

  setSessione({ codice, nome });
  socket.emit('uniscitiStanza', { codice, nome });
});

// Mostra stanze disponibili
document.getElementById('btnMostraStanze').addEventListener('click', () => {
  socket.emit('richiediStanzeDisponibili');
});

// Click sull'input mostra anche le stanze
document.getElementById('codiceStanza').addEventListener('focus', () => {
  socket.emit('richiediStanzeDisponibili');
});

// Chiudi lista quando si clicca fuori
document.addEventListener('click', (e) => {
  const lista = document.getElementById('listaStanze');
  const container = document.querySelector('.input-stanza-container');
  if (!container.contains(e.target) && !lista.contains(e.target)) {
    lista.classList.add('nascosto');
  }
});

// Ricevi stanze disponibili
socket.on('stanzeDisponibili', (stanze) => {
  const lista = document.getElementById('listaStanze');
  lista.innerHTML = '';

  if (stanze.length === 0) {
    lista.innerHTML = '<div class="nessuna-stanza">Nessuna stanza disponibile</div>';
  } else {
    stanze.forEach(stanza => {
      const item = document.createElement('div');
      item.className = 'stanza-item';
      const tipoPartita = stanza.numGiocatori === 4 ? '2v2' : '1v1';
      item.innerHTML = `
        <span class="codice">${stanza.codice}</span>
        <span class="creatore">di ${stanza.creatore} (${stanza.puntiVittoria}pt, ${tipoPartita}, ${stanza.giocatoriConnessi}/${stanza.numGiocatori})</span>
      `;
      item.addEventListener('click', () => {
        document.getElementById('codiceStanza').value = stanza.codice;
        lista.classList.add('nascosto');
      });
      lista.appendChild(item);
    });
  }

  lista.classList.remove('nascosto');
});

document.getElementById('btnConferma').addEventListener('click', () => {
  if (!cartaSelezionata) return;

  socket.emit('giocaCarta', {
    cartaId: cartaSelezionata.id,
    cartePresaIds: carteSelezionateTavolo.map(c => c.id)
  });
});

document.getElementById('btnAnnulla').addEventListener('click', () => {
  cartaSelezionata = null;
  carteSelezionateTavolo = [];
  document.querySelectorAll('.carta.selezionata').forEach(c => c.classList.remove('selezionata'));
  document.querySelectorAll('.carta.selezionabile').forEach(c => c.classList.remove('selezionabile'));
  document.getElementById('azioniMossa').classList.add('nascosto');
});

document.getElementById('btnPosa').addEventListener('click', () => {
  if (!cartaSelezionata) return;

  socket.emit('giocaCarta', {
    cartaId: cartaSelezionata.id,
    cartePresaIds: []
  });
});

document.getElementById('btnProssimoRound').addEventListener('click', () => {
  socket.emit('nuovoRound');
});

document.getElementById('btnNuovaPartita').addEventListener('click', () => {
  socket.emit('nuovaPartita');
});

// Socket events
socket.on('stanzaCreata', ({ codice, nome, numGiocatori }) => {
  const s = getSessione(); if (s) { s.codice = codice; setSessione(s); }
  document.getElementById('codiceStanzaDisplay').textContent = codice;
  numGiocatoriAttesa = numGiocatori || 2;
  aggiornaAttesa([{ nome }]);
  mostraSchermata('attesa');
});

socket.on('unitoAStanza', ({ codice, nome }) => {
  document.getElementById('codiceStanzaDisplay').textContent = codice;
  mostraSchermata('attesa');
});

socket.on('errore', (messaggio) => {
  mostraMessaggio(messaggio, 'errore');
});

socket.on('giocatoreUnito', ({ giocatori, maxGiocatori }) => {
  if (maxGiocatori) numGiocatoriAttesa = maxGiocatori;
  aggiornaAttesa(giocatori);
});

socket.on('partitaIniziata', (stato) => {
  statoGioco = stato;
  mostraSchermata('gioco');
  renderizzaGioco();
});

socket.on('statoAggiornato', (dati) => {
  const { cartaGiocata, giocatoreId, ...stato } = dati;

  // Se l'avversario ha giocato una carta, mostrala per 1.5 secondi
  if (cartaGiocata && giocatoreId !== socket.id) {
    mostraCartaAvversario(cartaGiocata, () => {
      statoGioco = stato;
      renderizzaGioco();
    });
  } else {
    statoGioco = stato;
    renderizzaGioco();
  }
});

// Mostra la carta giocata dall'avversario
function mostraCartaAvversario(carta, callback) {
  const tavoloContainer = document.querySelector('.tavolo-container');

  // Crea elemento carta temporaneo
  const cartaDiv = document.createElement('div');
  cartaDiv.className = 'carta carta-avversario-giocata';
  if (carta.valore === 10 && carta.seme === 'spade') {
    cartaDiv.classList.add('maresciallo');
  }
  if (carta.valore === 7 && carta.seme === 'denari') {
    cartaDiv.classList.add('settebello');
  }

  const imgSrc = getImmagineCarta(carta.valore, carta.seme);
  cartaDiv.innerHTML = `<img src="${imgSrc}" alt="${carta.valore} di ${carta.seme}">`;

  // Inserisci nel container del tavolo (sopra il tavolo)
  tavoloContainer.appendChild(cartaDiv);

  // Dopo 1 secondo, rimuovi e aggiorna
  setTimeout(() => {
    cartaDiv.remove();
    callback();
  }, 1000);
}

socket.on('combinazioniDisponibili', ({ cartaId, combinazioni, puoiPosare: posare }) => {
  combinazioniDisponibili = combinazioni;
  puoiPosare = posare;

  // Se è un asso e c'è almeno una carta a terra, prende tutto automaticamente
  if (cartaSelezionata && cartaSelezionata.valore === 1 && statoGioco.tavolo.length > 0) {
    socket.emit('giocaCarta', {
      cartaId: cartaSelezionata.id,
      cartePresaIds: statoGioco.tavolo.map(c => c.id)
    });
    return;
  }

  // Se non ci sono combinazioni possibili, posa automaticamente
  if (cartaSelezionata && combinazioni.length === 0) {
    socket.emit('giocaCarta', {
      cartaId: cartaSelezionata.id,
      cartePresaIds: []
    });
    return;
  }

  // Se c'è solo una combinazione possibile, prendi automaticamente
  if (cartaSelezionata && combinazioni.length === 1) {
    socket.emit('giocaCarta', {
      cartaId: cartaSelezionata.id,
      cartePresaIds: combinazioni[0]
    });
    return;
  }

  // Evidenzia carte selezionabili
  document.querySelectorAll('#tavolo .carta').forEach(el => {
    el.classList.remove('selezionabile');
    const id = el.dataset.id;
    if (combinazioni.some(comb => comb.includes(id))) {
      el.classList.add('selezionabile');
    }
  });

  aggiornaBottoniAzione();
});

socket.on('mossaNonValida', (errore) => {
  mostraMessaggio(errore, 'errore');
});

socket.on('fineRound', ({ stato, puntiRound, dettagliGiocatore, dettagliAvversario, finePartita, vincitore, pareggio }) => {
  statoGioco = stato;

  const titoloEl = document.getElementById('titoloFineRound');
  const btnProssimo = document.getElementById('btnProssimoRound');
  const btnNuova = document.getElementById('btnNuovaPartita');

  if (finePartita) {
    const haVinto = vincitore && vincitore.includes(statoGioco.nomeGiocatore);
    if (statoGioco.numGiocatori === 4) {
      titoloEl.textContent = haVinto ? 'La tua squadra ha vinto!' : `${vincitore} hanno vinto!`;
    } else {
      titoloEl.textContent = haVinto ? 'Hai vinto!' : `${vincitore} ha vinto!`;
    }
    btnProssimo.classList.add('nascosto');
    btnNuova.classList.remove('nascosto');
  } else if (pareggio) {
    titoloEl.textContent = 'Pareggio! Si continua...';
    btnProssimo.classList.remove('nascosto');
    btnNuova.classList.add('nascosto');
  } else {
    titoloEl.textContent = 'Fine Smazzata';
    btnProssimo.classList.remove('nascosto');
    btnNuova.classList.add('nascosto');
  }

  // Mostra nomi (squadra in 4 giocatori)
  const is4p = statoGioco.numGiocatori === 4;
  document.getElementById('nomeG1').textContent = is4p ? statoGioco.nomeSquadra : statoGioco.nomeGiocatore;
  document.getElementById('nomeG2').textContent = is4p ? statoGioco.nomeSquadraAvversaria : statoGioco.nomeAvversario;

  // Dettagli giocatore (G1)
  document.getElementById('scopeG1').textContent = dettagliGiocatore.scope;
  document.getElementById('denariG1').textContent = dettagliGiocatore.denari;
  document.getElementById('carteG1').textContent = dettagliGiocatore.carte;
  document.getElementById('primieraG1').textContent = dettagliGiocatore.primiera;
  document.getElementById('settebelloG1').textContent = dettagliGiocatore.settebello;
  document.getElementById('ottoG1').textContent = dettagliGiocatore.ottoDenari;
  document.getElementById('napolaG1').textContent = dettagliGiocatore.napola;
  document.getElementById('marescialliG1').textContent = dettagliGiocatore.marescialli;
  document.getElementById('puntiRoundG1').textContent = dettagliGiocatore.totale;
  document.getElementById('puntiTotaliG1').textContent = statoGioco.puntiGiocatore;

  // Mini carte G1 (solo scope e primiera)
  renderizzaMiniCarte('carteScopeG1', dettagliGiocatore.carteScope, true);
  renderizzaMiniCarte('cartePrimieraG1', dettagliGiocatore.cartePrimiera);

  // Dettagli avversario (G2)
  document.getElementById('scopeG2').textContent = dettagliAvversario.scope;
  document.getElementById('denariG2').textContent = dettagliAvversario.denari;
  document.getElementById('carteG2').textContent = dettagliAvversario.carte;
  document.getElementById('primieraG2').textContent = dettagliAvversario.primiera;
  document.getElementById('settebelloG2').textContent = dettagliAvversario.settebello;
  document.getElementById('ottoG2').textContent = dettagliAvversario.ottoDenari;
  document.getElementById('napolaG2').textContent = dettagliAvversario.napola;
  document.getElementById('marescialliG2').textContent = dettagliAvversario.marescialli;
  document.getElementById('puntiRoundG2').textContent = dettagliAvversario.totale;
  document.getElementById('puntiTotaliG2').textContent = statoGioco.puntiAvversario;

  // Mini carte G2 (solo scope e primiera)
  renderizzaMiniCarte('carteScopeG2', dettagliAvversario.carteScope, true);
  renderizzaMiniCarte('cartePrimieraG2', dettagliAvversario.cartePrimiera);

  mostraSchermata('fineRound');
});

// Renderizza mini carte nel riepilogo
function renderizzaMiniCarte(elementId, carte, mostraPunti = false) {
  const container = document.getElementById(elementId);
  if (!container) return;
  container.innerHTML = '';

  if (!carte || carte.length === 0) return;

  for (const carta of carte) {
    const div = document.createElement('div');
    div.className = 'mini-carta';
    if (mostraPunti && carta.punti) {
      div.classList.add('con-punti');
    }

    const imgSrc = getImmagineCarta(carta.valore, carta.seme);
    div.innerHTML = `<img src="${imgSrc}" alt="${carta.valore} di ${carta.seme}">`;

    if (mostraPunti && carta.punti) {
      const badge = document.createElement('span');
      badge.className = 'punti-badge';
      badge.textContent = '+' + carta.punti;
      div.appendChild(badge);
    }

    container.appendChild(div);
  }
}

socket.on('avversarioDisconnesso', ({ nome, timeout }) => {
  mostraMessaggio(`${nome} si è disconnesso. Attendo riconnessione (${timeout}s)...`, 'info');
});

socket.on('giocatoreRiconnesso', ({ nome }) => {
  mostraMessaggio(`${nome} si è riconnesso!`, 'successo');
});

socket.on('avversarioAbbandonato', ({ nome }) => {
  mostraMessaggio(`${nome} ha abbandonato la partita`, 'errore');
  setSessione(null);
  setTimeout(() => mostraSchermata('lobby'), 3000);
});

socket.on('connect', () => {
  const sess = getSessione();
  if (sess && sess.codice && sess.nome) {
    socket.emit('uniscitiStanza', { codice: sess.codice, nome: sess.nome });
  }
});
