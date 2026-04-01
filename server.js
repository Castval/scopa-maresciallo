const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { ScopaMaresciallo } = require('./game-logic');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Stanze di gioco
const stanze = new Map();
const disconnessioniPendenti = new Map();

// Genera codice stanza
function generaCodiceStanza() {
  const caratteri = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let codice = '';
  for (let i = 0; i < 6; i++) {
    codice += caratteri.charAt(Math.floor(Math.random() * caratteri.length));
  }
  return codice;
}

io.on('connection', (socket) => {
  console.log(`Giocatore connesso: ${socket.id}`);

  // Richiedi stanze disponibili
  socket.on('richiediStanzeDisponibili', () => {
    const stanzeDisponibili = [];
    for (const [codice, partita] of stanze) {
      if (partita.giocatori.length < partita.maxGiocatori && partita.stato === 'attesa') {
        stanzeDisponibili.push({
          codice: codice,
          creatore: partita.giocatori[0].nome,
          puntiVittoria: partita.puntiVittoria,
          numGiocatori: partita.maxGiocatori,
          giocatoriConnessi: partita.giocatori.length
        });
      }
    }
    socket.emit('stanzeDisponibili', stanzeDisponibili);
  });

  // Crea nuova stanza
  socket.on('creaStanza', ({ nome, puntiVittoria, numGiocatori }) => {
    const codice = generaCodiceStanza();
    const punti = [11, 21, 31, 41, 51].includes(puntiVittoria) ? puntiVittoria : 31;
    const num = [2, 4].includes(numGiocatori) ? numGiocatori : 2;
    const partita = new ScopaMaresciallo(codice, punti, num);
    partita.aggiungiGiocatore(socket.id, nome);

    stanze.set(codice, partita);
    socket.join(codice);
    socket.codiceStanza = codice;
    socket.nomeGiocatore = nome;

    socket.emit('stanzaCreata', { codice, nome, numGiocatori: num });
    console.log(`Stanza ${codice} creata da ${nome} (${num} giocatori)`);
  });

  // Unisciti a stanza esistente
  socket.on('uniscitiStanza', ({ codice, nome }) => {
    const partita = stanze.get(codice);

    if (!partita) {
      socket.emit('errore', 'Stanza non trovata');
      return;
    }

    // Controlla se è una riconnessione (giocatore con stesso nome, disconnesso o meno)
    const chiaveDisc = `${codice}_${nome}`;
    const giocatoreEsistente = partita.giocatori.find(g => g.nome === nome);

    if (giocatoreEsistente && (partita.stato === 'inCorso' || partita.stato === 'fineRound' || partita.stato === 'finePartita')) {
      const vecchioSocket = io.sockets.sockets.get(giocatoreEsistente.id);
      if (vecchioSocket) {
        vecchioSocket.codiceStanza = null;
        vecchioSocket.disconnect(true);
      }

      giocatoreEsistente.id = socket.id;
      giocatoreEsistente.disconnesso = false;

      if (disconnessioniPendenti.has(chiaveDisc)) {
        clearTimeout(disconnessioniPendenti.get(chiaveDisc));
        disconnessioniPendenti.delete(chiaveDisc);
      }

      socket.join(codice);
      socket.codiceStanza = codice;
      socket.nomeGiocatore = nome;

      socket.emit('partitaIniziata', partita.getStato(socket.id));
      io.to(codice).emit('giocatoreRiconnesso', { nome });
      console.log(`Giocatore ${nome} riconnesso nella stanza ${codice}`);
      return;
    }

    if (partita.giocatori.length >= partita.maxGiocatori) {
      socket.emit('errore', 'Stanza piena');
      return;
    }

    partita.aggiungiGiocatore(socket.id, nome);
    socket.join(codice);
    socket.codiceStanza = codice;
    socket.nomeGiocatore = nome;

    socket.emit('unitoAStanza', { codice, nome });

    // Notifica tutti i giocatori nella stanza
    io.to(codice).emit('giocatoreUnito', {
      giocatori: partita.giocatori.map(g => ({ id: g.id, nome: g.nome })),
      maxGiocatori: partita.maxGiocatori
    });

    // Inizia la partita quando la stanza è piena
    if (partita.giocatori.length === partita.maxGiocatori) {
      partita.iniziaPartita();

      for (const g of partita.giocatori) {
        io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
      }

      console.log(`Partita iniziata nella stanza ${codice} (${partita.maxGiocatori} giocatori)`);
    }
  });

  // Gioca carta
  socket.on('giocaCarta', ({ cartaId, cartePresaIds }) => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);

    if (!partita) {
      socket.emit('errore', 'Partita non trovata');
      return;
    }

    // Trova la carta giocata prima di eseguire la mossa
    const giocatore = partita.giocatori.find(g => g.id === socket.id);
    const cartaGiocata = giocatore?.mano.find(c => c.id === cartaId);
    const cartaInfo = cartaGiocata ? {
      valore: cartaGiocata.valore,
      seme: cartaGiocata.seme,
      id: cartaGiocata.id
    } : null;

    const risultato = partita.eseguiMossa(socket.id, cartaId, cartePresaIds || []);

    if (!risultato.valida) {
      socket.emit('mossaNonValida', risultato.errore);
      return;
    }

    // Se è fine round o fine partita
    if (partita.stato === 'fineRound' || partita.stato === 'finePartita') {
      const puntiRound = partita.calcolaPuntiRound();
      const dettagliPunti = partita.calcolaPuntiRoundDettagliato();

      for (const g of partita.giocatori) {
        const stato = partita.getStato(g.id);
        const sqMia = partita.getSquadraDelGiocatore(g.id);
        const sqAvv = 1 - sqMia;
        io.to(g.id).emit('fineRound', {
          stato,
          puntiRound,
          dettagliGiocatore: dettagliPunti[sqMia],
          dettagliAvversario: dettagliPunti[sqAvv],
          finePartita: partita.stato === 'finePartita',
          vincitore: partita.stato === 'finePartita' ? partita.getVincitore() : null,
          cartaGiocata: cartaInfo,
          giocatoreId: socket.id
        });
      }
    } else {
      // Aggiorna stato per entrambi i giocatori
      for (const g of partita.giocatori) {
        io.to(g.id).emit('statoAggiornato', {
          ...partita.getStato(g.id),
          cartaGiocata: cartaInfo,
          giocatoreId: socket.id
        });
      }
    }
  });

  // Richiedi combinazioni possibili
  socket.on('richiediCombinazioni', (cartaId) => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);

    if (!partita) return;

    const giocatore = partita.giocatori.find(g => g.id === socket.id);
    if (!giocatore) return;

    const carta = giocatore.mano.find(c => c.id === cartaId);
    if (!carta) return;

    const combinazioni = partita.trovaCombinazioni(carta, partita.tavolo);

    // Aggiungi opzione "posa" se non ci sono combinazioni obbligatorie
    // O se l'unica combinazione è con carta identica (e non è scopa)
    const haPresaObbligatoria = combinazioni.some(comb => {
      // Verifica se è una presa con carta identica che non è scopa
      const conIdentica = comb.some(c => c.seme === carta.seme && c.valore === carta.valore);
      const sarebbeScopa = comb.length === partita.tavolo.length;
      return !conIdentica || sarebbeScopa;
    });

    socket.emit('combinazioniDisponibili', {
      cartaId,
      combinazioni: combinazioni.map(comb => comb.map(c => c.id)),
      puoiPosare: !haPresaObbligatoria || combinazioni.length === 0
    });
  });

  // Nuovo round
  socket.on('nuovoRound', () => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);

    if (!partita || partita.stato !== 'fineRound') return;

    partita.nuovoRound();

    for (const g of partita.giocatori) {
      io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
    }
  });

  // Nuova partita
  socket.on('nuovaPartita', () => {
    const codice = socket.codiceStanza;
    const partita = stanze.get(codice);

    if (!partita) return;

    // Reset punteggi
    for (const g of partita.giocatori) {
      g.puntiTotali = 0;
    }

    partita.iniziaPartita();

    for (const g of partita.giocatori) {
      io.to(g.id).emit('partitaIniziata', partita.getStato(g.id));
    }
  });

  // Disconnessione
  socket.on('disconnect', () => {
    console.log(`Giocatore disconnesso: ${socket.id}`);

    const codice = socket.codiceStanza;
    if (!codice) return;

    const partita = stanze.get(codice);
    if (!partita) return;

    const giocatore = partita.giocatori.find(g => g.id === socket.id);
    if (!giocatore) return;

    if (partita.stato === 'inCorso' || partita.stato === 'fineRound') {
      giocatore.disconnesso = true;
      const nome = giocatore.nome;
      const chiaveDisc = `${codice}_${nome}`;

      io.to(codice).emit('avversarioDisconnesso', { nome, timeout: 180 });
      console.log(`Giocatore ${nome} disconnesso dalla stanza ${codice}, attendo riconnessione...`);

      const timer = setTimeout(() => {
        disconnessioniPendenti.delete(chiaveDisc);
        partita.rimuoviGiocatore(giocatore.id);
        io.to(codice).emit('avversarioAbbandonato', { nome });
        console.log(`Giocatore ${nome} rimosso dalla stanza ${codice} (timeout)`);

        if (partita.giocatori.filter(g => !g.disconnesso).length === 0) {
          stanze.delete(codice);
          console.log(`Stanza ${codice} eliminata`);
        }
      }, 180000);

      disconnessioniPendenti.set(chiaveDisc, timer);
    } else {
      partita.rimuoviGiocatore(socket.id);
      io.to(codice).emit('avversarioAbbandonato', { nome: giocatore.nome });

      if (partita.giocatori.length === 0) {
        stanze.delete(codice);
        console.log(`Stanza ${codice} eliminata`);
      }
    }
  });
});

server.listen(PORT, () => {
  console.log(`Server Scopa Maresciallo in esecuzione su http://localhost:${PORT}`);
});
