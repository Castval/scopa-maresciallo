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
let carteSelezionateTavolo = [];
let combinazioniDisponibili = [];
let puoiPosare = false;

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

  // Info giocatori
  document.getElementById('nomeGiocatoreDisplay').textContent = statoGioco.nomeGiocatore;
  document.getElementById('nomeAvversario').textContent = statoGioco.nomeAvversario || 'Avversario';
  document.getElementById('puntiGiocatore').textContent = statoGioco.puntiGiocatore;
  document.getElementById('puntiAvversario').textContent = statoGioco.puntiAvversario;
  document.getElementById('carteAvversario').textContent = statoGioco.carteAvversario;
  document.getElementById('carteRimanenti').textContent = statoGioco.carteRimanenti;

  // Turno
  const turnoIndicatore = document.getElementById('turnoIndicatore');
  if (statoGioco.turnoMio) {
    turnoIndicatore.textContent = 'Tocca a te!';
    turnoIndicatore.classList.add('mio-turno');
  } else {
    turnoIndicatore.textContent = 'Turno avversario';
    turnoIndicatore.classList.remove('mio-turno');
  }

  // Mano avversario
  const manoAvversario = document.getElementById('manoAvversario');
  manoAvversario.innerHTML = '';
  for (let i = 0; i < statoGioco.carteAvversario; i++) {
    const carta = document.createElement('div');
    carta.className = 'carta';
    manoAvversario.appendChild(carta);
  }

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

  // Reset selezione
  cartaSelezionata = null;
  carteSelezionateTavolo = [];
  combinazioniDisponibili = [];
  puoiPosare = false;
  document.getElementById('azioniMossa').classList.add('nascosto');
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

// Event listeners
document.getElementById('btnCreaStanza').addEventListener('click', () => {
  const nome = document.getElementById('nomeGiocatore').value.trim();
  if (!nome) {
    mostraMessaggio('Inserisci il tuo nome', 'errore');
    return;
  }
  socket.emit('creaStanza', nome);
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

  socket.emit('uniscitiStanza', { codice, nome });
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
socket.on('stanzaCreata', ({ codice, nome }) => {
  document.getElementById('codiceStanzaDisplay').textContent = codice;
  mostraSchermata('attesa');
});

socket.on('unitoAStanza', ({ codice, nome }) => {
  mostraSchermata('attesa');
});

socket.on('errore', (messaggio) => {
  mostraMessaggio(messaggio, 'errore');
});

socket.on('giocatoreUnito', ({ giocatori }) => {
  // Aggiorna UI se necessario
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

socket.on('fineRound', ({ stato, puntiRound, dettagliGiocatore, dettagliAvversario, finePartita, vincitore }) => {
  statoGioco = stato;

  const titoloEl = document.getElementById('titoloFineRound');
  const btnProssimo = document.getElementById('btnProssimoRound');
  const btnNuova = document.getElementById('btnNuovaPartita');

  if (finePartita) {
    titoloEl.textContent = vincitore === statoGioco.nomeGiocatore ?
      'Hai vinto!' : `${vincitore} ha vinto!`;
    btnProssimo.classList.add('nascosto');
    btnNuova.classList.remove('nascosto');
  } else {
    titoloEl.textContent = 'Fine Smazzata';
    btnProssimo.classList.remove('nascosto');
    btnNuova.classList.add('nascosto');
  }

  // Mostra nomi
  document.getElementById('nomeG1').textContent = statoGioco.nomeGiocatore;
  document.getElementById('nomeG2').textContent = statoGioco.nomeAvversario;

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

  mostraSchermata('fineRound');
});

socket.on('avversarioDisconnesso', () => {
  mostraMessaggio('L\'avversario si è disconnesso', 'errore');
  setTimeout(() => {
    mostraSchermata('lobby');
  }, 2000);
});
