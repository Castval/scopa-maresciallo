// Logica del gioco Scopa Maresciallo

const SEMI = ['denari', 'coppe', 'bastoni', 'spade'];
const VALORI = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]; // 1 = Asso, 8 = Fante, 9 = Cavallo, 10 = Re

// Valori per la primiera
const PRIMIERA_VALORI = {
  7: 21,
  6: 18,
  1: 16,
  5: 15,
  4: 14,
  3: 13,
  2: 12,
  8: 10,
  9: 10,
  10: 10
};

class Carta {
  constructor(valore, seme, mazzoId) {
    this.valore = valore;
    this.seme = seme;
    this.mazzoId = mazzoId; // 0 o 1 per distinguere i due mazzi
    this.id = `${valore}_${seme}_${mazzoId}`;
  }

  isMaresciallo() {
    return this.valore === 10 && this.seme === 'spade';
  }

  isSettebello() {
    return this.valore === 7 && this.seme === 'denari';
  }

  isOttoDenari() {
    return this.valore === 8 && this.seme === 'denari';
  }

  isAsso() {
    return this.valore === 1;
  }

  equals(altra) {
    return this.valore === altra.valore && this.seme === altra.seme;
  }

  exactEquals(altra) {
    return this.valore === altra.valore && this.seme === altra.seme && this.mazzoId === altra.mazzoId;
  }
}

class Mazzo {
  constructor() {
    this.carte = [];
    this.reset();
  }

  reset() {
    this.carte = [];
    // Creiamo 2 mazzi
    for (let mazzoId = 0; mazzoId < 2; mazzoId++) {
      for (const seme of SEMI) {
        for (const valore of VALORI) {
          this.carte.push(new Carta(valore, seme, mazzoId));
        }
      }
    }
    this.mescola();
  }

  mescola() {
    for (let i = this.carte.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.carte[i], this.carte[j]] = [this.carte[j], this.carte[i]];
    }
  }

  pesca(n = 1) {
    return this.carte.splice(0, n);
  }

  rimanenti() {
    return this.carte.length;
  }
}

class Giocatore {
  constructor(id, nome) {
    this.id = id;
    this.nome = nome;
    this.mano = [];
    this.prese = [];
    this.scope = []; // Array di { carta, valore } dove valore è 1 o 3
    this.puntiTotali = 0;
  }

  reset() {
    this.mano = [];
    this.prese = [];
    this.scope = [];
  }

  resetMano() {
    this.mano = [];
  }
}

class ScopaMaresciallo {
  constructor(roomId) {
    this.roomId = roomId;
    this.mazzo = new Mazzo();
    this.giocatori = [];
    this.tavolo = [];
    this.turnoCorrente = 0;
    this.stato = 'attesa'; // attesa, inCorso, fineRound, finePartita
    this.ultimoAPrendere = null;
    this.puntiVittoria = 31;
  }

  aggiungiGiocatore(id, nome) {
    if (this.giocatori.length >= 2) return false;
    this.giocatori.push(new Giocatore(id, nome));
    return true;
  }

  rimuoviGiocatore(id) {
    this.giocatori = this.giocatori.filter(g => g.id !== id);
  }

  iniziaPartita() {
    if (this.giocatori.length !== 2) return false;
    this.stato = 'inCorso';
    this.iniziaRound();
    return true;
  }

  iniziaRound() {
    this.mazzo.reset();
    this.tavolo = [];
    this.ultimoAPrendere = null;

    for (const g of this.giocatori) {
      g.reset();
    }

    // Nessuna carta iniziale al tavolo (regola Scopa Maresciallo)

    // Distribuisci 5 carte a testa
    this.distribuisciCarte();
  }

  distribuisciCarte() {
    for (const g of this.giocatori) {
      g.mano = this.mazzo.pesca(5);
    }
  }

  getGiocatoreCorrente() {
    return this.giocatori[this.turnoCorrente];
  }

  // Trova tutte le combinazioni possibili per prendere
  trovaCombinazioni(carta, tavolo) {
    const combinazioni = [];

    // Se è un asso, prende tutto
    if (carta.isAsso() && tavolo.length > 0) {
      combinazioni.push([...tavolo]);
      return combinazioni;
    }

    // Cerca carte singole con stesso valore (ma regola carta uguale!)
    const carteSingolaValore = tavolo.filter(c => c.valore === carta.valore);

    // Controlla se ci sono carte identiche (stesso seme e valore)
    const carteIdentiche = carteSingolaValore.filter(c => c.seme === carta.seme);

    // Se ci sono carte identiche, possiamo prenderle SOLO se è scopa
    // Altrimenti possiamo prendere carte dello stesso valore ma seme diverso
    const carteNonIdentiche = carteSingolaValore.filter(c => c.seme !== carta.seme);

    // Se c'è solo una carta identica sul tavolo, è scopa (3 punti)
    if (carteIdentiche.length > 0 && tavolo.length === 1) {
      combinazioni.push([carteIdentiche[0]]);
      return combinazioni;
    }

    for (const c of carteNonIdentiche) {
      combinazioni.push([c]);
    }

    // Se c'è una carta singola dello stesso valore, NON si possono fare somme
    // (regola: carta singola ha priorità sulla somma)
    if (carteNonIdentiche.length > 0) {
      return combinazioni;
    }

    // Cerca combinazioni che sommano al valore della carta
    // (solo se non c'è carta singola prendibile)
    if (carta.valore > 1) {
      const combSomma = this.trovaCombinazoniSomma(tavolo, carta.valore);
      for (const comb of combSomma) {
        if (comb.length > 1) { // Solo combinazioni di più carte
          combinazioni.push(comb);
        }
      }
    }

    return combinazioni;
  }

  // Trova combinazioni che sommano a un valore target
  trovaCombinazoniSomma(carte, target, start = 0, corrente = []) {
    const risultati = [];

    for (let i = start; i < carte.length; i++) {
      const carta = carte[i];
      const nuovaSomma = corrente.reduce((s, c) => s + c.valore, 0) + carta.valore;

      if (nuovaSomma === target) {
        risultati.push([...corrente, carta]);
      } else if (nuovaSomma < target) {
        const subRisultati = this.trovaCombinazoniSomma(carte, target, i + 1, [...corrente, carta]);
        risultati.push(...subRisultati);
      }
    }

    return risultati;
  }

  // Controlla se una mossa è valida
  verificaMossa(giocatoreId, cartaId, cartePresaIds) {
    const giocatore = this.giocatori.find(g => g.id === giocatoreId);
    if (!giocatore) return { valida: false, errore: 'Giocatore non trovato' };

    if (this.getGiocatoreCorrente().id !== giocatoreId) {
      return { valida: false, errore: 'Non è il tuo turno' };
    }

    const carta = giocatore.mano.find(c => c.id === cartaId);
    if (!carta) return { valida: false, errore: 'Carta non in mano' };

    const cartePresa = cartePresaIds.map(id => this.tavolo.find(c => c.id === id)).filter(c => c);

    if (cartePresa.length !== cartePresaIds.length) {
      return { valida: false, errore: 'Carte da prendere non valide' };
    }

    // Caso speciale: l'asso va sempre nelle prese (anche se tavolo vuoto)
    if (carta.isAsso()) {
      if (this.tavolo.length === 0) {
        // Asso con tavolo vuoto: va nelle prese, non è scopa
        return { valida: true, tipo: 'presa', scopa: false, assoSolo: true };
      }
      // Asso con carte a terra: prende tutto, ma NON è scopa
      if (cartePresa.length !== this.tavolo.length) {
        return { valida: false, errore: 'L\'asso deve prendere tutte le carte' };
      }
      return { valida: true, tipo: 'presa', scopa: false };
    }

    // Se non prende niente, deve posare
    if (cartePresa.length === 0) {
      // Verifica che non ci siano prese obbligatorie
      const combinazioniPossibili = this.trovaCombinazioni(carta, this.tavolo);
      if (combinazioniPossibili.length > 0) {
        return { valida: false, errore: 'Devi prendere se puoi' };
      }
      return { valida: true, tipo: 'posa' };
    }

    // Verifica presa con carta identica (stesso seme e valore)
    const presaConIdentica = cartePresa.some(c => c.seme === carta.seme && c.valore === carta.valore);

    if (presaConIdentica) {
      // Si può fare solo se è scopa
      const sarebbeScopa = cartePresa.length === this.tavolo.length;
      if (!sarebbeScopa) {
        return { valida: false, errore: 'Non puoi prendere carta identica se non fai scopa' };
      }
    }

    // Verifica presa singola o somma
    if (cartePresa.length === 1) {
      if (cartePresa[0].valore !== carta.valore) {
        return { valida: false, errore: 'Il valore non corrisponde' };
      }
    } else {
      const somma = cartePresa.reduce((s, c) => s + c.valore, 0);
      if (somma !== carta.valore) {
        return { valida: false, errore: 'La somma non corrisponde' };
      }
    }

    const scopa = cartePresa.length === this.tavolo.length;
    return { valida: true, tipo: 'presa', scopa, conIdentica: presaConIdentica };
  }

  // Esegue una mossa
  eseguiMossa(giocatoreId, cartaId, cartePresaIds) {
    const verifica = this.verificaMossa(giocatoreId, cartaId, cartePresaIds);
    if (!verifica.valida) return verifica;

    const giocatore = this.giocatori.find(g => g.id === giocatoreId);
    const cartaIndex = giocatore.mano.findIndex(c => c.id === cartaId);
    const carta = giocatore.mano.splice(cartaIndex, 1)[0];

    if (verifica.tipo === 'posa') {
      this.tavolo.push(carta);
    } else {
      // Presa
      const cartePrese = [];
      for (const id of cartePresaIds) {
        const idx = this.tavolo.findIndex(c => c.id === id);
        if (idx !== -1) {
          cartePrese.push(this.tavolo.splice(idx, 1)[0]);
        }
      }

      giocatore.prese.push(carta, ...cartePrese);
      this.ultimoAPrendere = giocatoreId;

      if (verifica.scopa) {
        // Scopa con carta identica vale 3, altrimenti 1
        let valoreScopa = verifica.conIdentica ? 3 : 1;

        // Controlla se la carta giocata è il maresciallo (10 di spade)
        const cartaIsMaresciallo = carta.valore === 10 && carta.seme === 'spade';

        // Controlla se tra le carte prese c'è un maresciallo
        const presaContieneMaresciallo = cartePrese.some(c => c.valore === 10 && c.seme === 'spade');

        // Caso speciale: scopa maresciallo con maresciallo = 10 punti (e niente penalità)
        if (cartaIsMaresciallo && presaContieneMaresciallo) {
          giocatore.scope.push({ carta: carta.id, valore: 10, marescialloConMaresciallo: true });
        } else if (cartaIsMaresciallo || presaContieneMaresciallo) {
          // Scopa con maresciallo (giocato O preso): -4 punti
          giocatore.scope.push({ carta: carta.id, valore: -4 });
        } else {
          giocatore.scope.push({ carta: carta.id, valore: valoreScopa });
        }
      }
    }

    // Prossimo turno
    this.turnoCorrente = (this.turnoCorrente + 1) % 2;

    // Controlla se le mani sono vuote
    const maniVuote = this.giocatori.every(g => g.mano.length === 0);

    if (maniVuote) {
      if (this.mazzo.rimanenti() > 0) {
        this.distribuisciCarte();
      } else {
        // Fine round - carte rimanenti all'ultimo che ha preso
        this.fineRound();
      }
    }

    return { valida: true, ...verifica };
  }

  fineRound() {
    // Carte rimanenti sul tavolo vanno all'ultimo che ha preso
    if (this.ultimoAPrendere && this.tavolo.length > 0) {
      const giocatore = this.giocatori.find(g => g.id === this.ultimoAPrendere);
      if (giocatore) {
        giocatore.prese.push(...this.tavolo);
        this.tavolo = [];
      }
    }

    // Calcola punti del round
    const puntiRound = this.calcolaPuntiRound();

    for (const g of this.giocatori) {
      g.puntiTotali += puntiRound[g.id];
    }

    // Controlla vittoria
    const g1 = this.giocatori[0];
    const g2 = this.giocatori[1];

    const g1Vince = g1.puntiTotali >= this.puntiVittoria;
    const g2Vince = g2.puntiTotali >= this.puntiVittoria;

    if (g1Vince || g2Vince) {
      // Se entrambi hanno raggiunto 31, vince chi ha più punti
      // Se sono pari, si continua a giocare
      if (g1Vince && g2Vince) {
        if (g1.puntiTotali > g2.puntiTotali) {
          this.stato = 'finePartita';
          return { finePartita: true, vincitore: g1.id, puntiRound };
        } else if (g2.puntiTotali > g1.puntiTotali) {
          this.stato = 'finePartita';
          return { finePartita: true, vincitore: g2.id, puntiRound };
        } else {
          // Pareggio a 31 o più: si continua a giocare
          this.stato = 'fineRound';
          return { finePartita: false, puntiRound, pareggio: true };
        }
      } else {
        // Solo uno ha raggiunto 31
        const vincitore = g1Vince ? g1 : g2;
        this.stato = 'finePartita';
        return { finePartita: true, vincitore: vincitore.id, puntiRound };
      }
    }

    this.stato = 'fineRound';
    return { finePartita: false, puntiRound };
  }

  calcolaPuntiRound() {
    const punti = {};

    for (const g of this.giocatori) {
      punti[g.id] = 0;
    }

    const g1 = this.giocatori[0];
    const g2 = this.giocatori[1];

    // Scope
    for (const g of this.giocatori) {
      for (const scopa of g.scope) {
        punti[g.id] += scopa.valore;
      }
    }

    // Marescialli (-1 punto per ogni maresciallo preso)
    // Eccezione: se scopa maresciallo con maresciallo, nessuna penalità
    for (const g of this.giocatori) {
      const marescialli = g.prese.filter(c => c.valore === 10 && c.seme === 'spade').length;
      // Marescialli già contati nelle scope (sia -4 che +10)
      const marescialliScopaNegativa = g.scope.filter(s => s.valore === -4).length;
      const marescialliScopaPositiva = g.scope.filter(s => s.marescialloConMaresciallo).length * 2; // Prende 2 marescialli
      const marescialliConPenalita = marescialli - marescialliScopaNegativa - marescialliScopaPositiva;
      punti[g.id] -= Math.max(0, marescialliConPenalita);
    }

    // Più carte di denari
    const denariG1 = g1.prese.filter(c => c.seme === 'denari').length;
    const denariG2 = g2.prese.filter(c => c.seme === 'denari').length;
    if (denariG1 > denariG2) punti[g1.id]++;
    else if (denariG2 > denariG1) punti[g2.id]++;

    // Più carte totali
    if (g1.prese.length > g2.prese.length) punti[g1.id]++;
    else if (g2.prese.length > g1.prese.length) punti[g2.id]++;

    // Settebello (può valere 2 volte)
    for (const g of this.giocatori) {
      const settebelli = g.prese.filter(c => c.valore === 7 && c.seme === 'denari').length;
      punti[g.id] += settebelli;
    }

    // Otto di denari (1 punto per ogni 8 di denari se si ha anche il settebello)
    for (const g of this.giocatori) {
      const settebelli = g.prese.filter(c => c.valore === 7 && c.seme === 'denari').length;
      const ottoDenari = g.prese.filter(c => c.valore === 8 && c.seme === 'denari').length;
      // Il bonus è il minimo tra settebelli e otto di denari
      punti[g.id] += Math.min(settebelli, ottoDenari);
    }

    // Primiera
    const primieraG1 = this.calcolaPrimiera(g1.prese);
    const primieraG2 = this.calcolaPrimiera(g2.prese);
    if (primieraG1 > primieraG2) punti[g1.id]++;
    else if (primieraG2 > primieraG1) punti[g2.id]++;

    // Napola (può valere 2 volte)
    for (const g of this.giocatori) {
      punti[g.id] += this.calcolaNapola(g.prese);
    }

    return punti;
  }

  calcolaPuntiRoundDettagliato() {
    const dettagli = {};
    const g1 = this.giocatori[0];
    const g2 = this.giocatori[1];

    for (const g of this.giocatori) {
      // Calcola scope (solo valori positivi: +1, +3, +10)
      let scopePunti = 0;
      const carteScope = [];
      for (const scopa of g.scope) {
        if (scopa.valore > 0) {
          scopePunti += scopa.valore;
          // Estrai info carta dalla stringa id "valore_seme_mazzoId"
          const parti = scopa.carta.split('_');
          carteScope.push({ valore: parseInt(parti[0]), seme: parti[1], punti: scopa.valore });
        }
      }

      // Marescialli: conta la penalità totale
      const carteMarescialli = g.prese.filter(c => c.valore === 10 && c.seme === 'spade');
      const marescialli = carteMarescialli.length;
      const scopeMarescialloNegative = g.scope.filter(s => s.valore === -4).length;
      const marescialliScopaPositiva = g.scope.filter(s => s.marescialloConMaresciallo).length * 2;
      const marescialliNormali = Math.max(0, marescialli - scopeMarescialloNegative - marescialliScopaPositiva);
      const penalitaTotale = marescialliNormali + (scopeMarescialloNegative * 4);

      // Settebello
      const carteSettebello = g.prese.filter(c => c.valore === 7 && c.seme === 'denari');
      const settebelli = carteSettebello.length;

      // Otto di denari
      const carteOttoDenari = g.prese.filter(c => c.valore === 8 && c.seme === 'denari');
      const ottoDenari = carteOttoDenari.length;
      const bonusOtto = Math.min(settebelli, ottoDenari);

      // Napola
      const napolaPunti = this.calcolaNapola(g.prese);
      const carteNapola = this.getCarteNapola(g.prese);

      // Carte primiera
      const cartePrimiera = this.getCartePrimiera(g.prese);

      dettagli[g.id] = {
        nome: g.nome,
        scope: scopePunti,
        numScope: g.scope.length,
        carteScope: carteScope,
        marescialli: -penalitaTotale,
        carteMarescialli: carteMarescialli.map(c => ({ valore: c.valore, seme: c.seme })),
        settebello: settebelli,
        carteSettebello: carteSettebello.map(c => ({ valore: c.valore, seme: c.seme })),
        ottoDenari: bonusOtto,
        carteOttoDenari: carteOttoDenari.slice(0, bonusOtto).map(c => ({ valore: c.valore, seme: c.seme })),
        napola: napolaPunti,
        carteNapola: carteNapola,
        denari: 0,
        numDenari: g.prese.filter(c => c.seme === 'denari').length,
        carte: 0,
        numCarte: g.prese.length,
        primiera: 0,
        cartePrimiera: cartePrimiera,
        totale: 0
      };
    }

    // Più carte di denari
    const denariG1 = g1.prese.filter(c => c.seme === 'denari').length;
    const denariG2 = g2.prese.filter(c => c.seme === 'denari').length;
    if (denariG1 > denariG2) dettagli[g1.id].denari = 1;
    else if (denariG2 > denariG1) dettagli[g2.id].denari = 1;

    // Più carte totali
    if (g1.prese.length > g2.prese.length) dettagli[g1.id].carte = 1;
    else if (g2.prese.length > g1.prese.length) dettagli[g2.id].carte = 1;

    // Primiera
    const primieraG1 = this.calcolaPrimiera(g1.prese);
    const primieraG2 = this.calcolaPrimiera(g2.prese);
    if (primieraG1 > primieraG2) dettagli[g1.id].primiera = 1;
    else if (primieraG2 > primieraG1) dettagli[g2.id].primiera = 1;

    // Calcola totali
    for (const g of this.giocatori) {
      const d = dettagli[g.id];
      d.totale = d.scope + d.marescialli + d.settebello + d.ottoDenari + d.napola + d.denari + d.carte + d.primiera;
    }

    return dettagli;
  }

  // Ottiene le carte che formano la napola
  getCarteNapola(carte) {
    const denari = carte.filter(c => c.seme === 'denari');
    const carteNapola = [];

    // Conta le carte per valore
    const conteggio = {};
    for (const c of denari) {
      conteggio[c.valore] = (conteggio[c.valore] || 0) + 1;
    }

    // Verifica se c'è napola (1,2,3 di denari)
    if ((conteggio[1] || 0) >= 1 && (conteggio[2] || 0) >= 1 && (conteggio[3] || 0) >= 1) {
      // Trova fino a dove arriva la napola
      let maxValore = 3;
      for (let v = 4; v <= 10; v++) {
        if ((conteggio[v] || 0) >= 1) {
          maxValore = v;
        } else {
          break;
        }
      }

      // Aggiungi le carte della napola
      for (let v = 1; v <= maxValore; v++) {
        carteNapola.push({ valore: v, seme: 'denari' });
      }
    }

    return carteNapola;
  }

  // Ottiene le carte migliori per la primiera
  getCartePrimiera(carte) {
    const cartePrimiera = [];

    for (const seme of SEMI) {
      const carteSeme = carte.filter(c => c.seme === seme);
      if (carteSeme.length > 0) {
        // Trova la carta con il valore primiera più alto
        let migliore = carteSeme[0];
        for (const c of carteSeme) {
          if (PRIMIERA_VALORI[c.valore] > PRIMIERA_VALORI[migliore.valore]) {
            migliore = c;
          }
        }
        cartePrimiera.push({ valore: migliore.valore, seme: migliore.seme });
      }
    }

    return cartePrimiera;
  }

  calcolaPrimiera(carte) {
    const migliorePerSeme = {};

    for (const seme of SEMI) {
      const carteSeme = carte.filter(c => c.seme === seme);
      if (carteSeme.length > 0) {
        // Prendi il valore primiera più alto per questo seme
        migliorePerSeme[seme] = Math.max(...carteSeme.map(c => PRIMIERA_VALORI[c.valore]));
      }
    }

    // Primiera valida solo se hai almeno una carta per seme
    if (Object.keys(migliorePerSeme).length < 4) return 0;

    return Object.values(migliorePerSeme).reduce((a, b) => a + b, 0);
  }

  calcolaNapola(carte) {
    const denari = carte.filter(c => c.seme === 'denari');
    let puntiTotali = 0;

    // Conta quante volte possiamo fare la napola (max 2)
    for (let volta = 0; volta < 2; volta++) {
      // Conta le carte disponibili per questa volta
      const conteggio = {};
      for (const c of denari) {
        conteggio[c.valore] = (conteggio[c.valore] || 0) + 1;
      }

      // Verifica se abbiamo 1, 2, 3 di denari
      if ((conteggio[1] || 0) > volta &&
          (conteggio[2] || 0) > volta &&
          (conteggio[3] || 0) > volta) {

        // Base: 3 punti per 1,2,3
        let puntiNapola = 3;

        // Aggiungi 1 punto per ogni carta successiva
        for (let v = 4; v <= 10; v++) {
          if ((conteggio[v] || 0) > volta) {
            puntiNapola++;
          } else {
            break;
          }
        }

        puntiTotali += puntiNapola;
      }
    }

    return puntiTotali;
  }

  nuovoRound() {
    if (this.stato !== 'fineRound') return false;
    this.turnoCorrente = (this.turnoCorrente + 1) % 2; // Alterna chi inizia
    this.iniziaRound();
    this.stato = 'inCorso';
    return true;
  }

  getStato(giocatoreId) {
    const giocatore = this.giocatori.find(g => g.id === giocatoreId);
    const avversario = this.giocatori.find(g => g.id !== giocatoreId);

    return {
      roomId: this.roomId,
      stato: this.stato,
      tavolo: this.tavolo,
      manoGiocatore: giocatore ? giocatore.mano : [],
      carteAvversario: avversario ? avversario.mano.length : 0,
      preseGiocatore: giocatore ? giocatore.prese.length : 0,
      preseAvversario: avversario ? avversario.prese.length : 0,
      scopeGiocatore: giocatore ? giocatore.scope : [],
      scopeAvversario: avversario ? avversario.scope : [],
      puntiGiocatore: giocatore ? giocatore.puntiTotali : 0,
      puntiAvversario: avversario ? avversario.puntiTotali : 0,
      nomeGiocatore: giocatore ? giocatore.nome : '',
      nomeAvversario: avversario ? avversario.nome : '',
      turnoMio: this.getGiocatoreCorrente()?.id === giocatoreId,
      carteRimanenti: this.mazzo.rimanenti()
    };
  }
}

module.exports = { ScopaMaresciallo, Carta, Mazzo, Giocatore, SEMI, VALORI };
