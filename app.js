const stackReference = [];
for (let i = 0; i < 4; i++) {
  stackReference.push({
    name: '+4',
    number: -1,
    color: ''
  },
  {
    name: '+col',
    number: -1,
    color: ''
  });
}
const colors = ['red', 'blue', 'green', 'yellow'];
for (const color of colors) {
  for (let a = 0; a < 2; a++) {
    for (let i = a; i < 10; i++) {
      stackReference.push({
        name: `${color}${i}`,
        number: i,
        color: color
      });
    }
    stackReference.push({
      name: `${color}+2`,
      number: -1,
      color: color
    },
    {
      name: `${color}Pass`,
      number: -1,
      color: color
    },
    {
      name: `${color}Turn`,
      number: -1,
      color: color
    });
  }
}
shuffle(stackReference);
function randomCard() {
  const card = stackReference[Math.floor(Math.random() * stackReference.length)];
  return card;
}
const nCards = 7;

const game = new Vue({
  el: '#app',
  data: {
    state: 'main',
    gameId: '',
    gameData: {},
    host: false,
    playerId: 0,
    isPickingColor: false,
    canSkip: false,
    unoDeclared: false
  },
  methods: {
    createGame: function() {

      const ref = firebase.database().ref('games').push();
      const key = ref.key;
      
      const localName = localStorage.getItem("uno-online-name");

      const num = Math.floor(Math.random() * 9);
      const col = colors[Math.floor(Math.random() * 4)];
      
      this.gameData.currentCard = {
        name: `${col}${num}`,
        number: num,
        color: col
      }

      this.gameData.players = [
        {
          name: localName && localName.trim() ? localName : 'Guest 1',
          cards: stackReference.slice(0, nCards),
          id: 0
        }
      ];
      
      this.gameData.cardStack = 0;
      this.gameData.turn = 0;
      this.gameData.started = false;
      this.gameData.winners = [];
      this.host = true;
      this.gameData.currentPlayer = 0;
      this.gameData.turnOrder = 1;

      ref.set(this.gameData).then(() => {
        this.gameId = key;
        this.state = 'lobby';
        window.history.replaceState(null, null, `?game=${this.gameId}`);
      });

      ref.on('value', handleGameUpdate);

    },
    startGame: function() {
      if (this.host && this.gameData.players.length > 1) {
        this.gameData.started = true;
        gameServerRef('started').set(true).then(() => {
          this.state = 'game';
        });
      }
    },
    changeName: async function() {
      const newName = await showPopup({
        header: 'Enter a new name.',
        type: 'text',
        placeholder: this.client.name
      });
      if (newName === null) return;
      if (!newName.trim() || newName.length > 15) {
        showPopup({
          header: 'Invalid name.',
          paragraph: 'Name must be less than 15 characters and non-empty.'
        });
        return;
      }
      
      for (const player of this.gameData.players) {
        if (player.name === newName) {
          showPopup({
            header: 'Name already in use.'
          });
          return;
        }
      }

      this.client.name = newName;
      localStorage.setItem("uno-online-name", newName);
      updateSelfOnServer();
    },
    playCard: async function(index) {
      const card = this.client.cards[index];
      const removeCard = () => {
        this.client.cards.splice(index, 1);
        if (this.client.cards.length === 1 && !this.unoDeclared) {
          this.client.cards.push(randomCard(), randomCard(), randomCard(), randomCard());
          showPopup({
            header: 'You forgot to declare UNO!'
          });
        }
        this.unoDeclared = false;
      }
      const currentCard = this.gameData.currentCard;
      //Same card, skip turn
      if ((currentCard.color === card.color && currentCard.number === card.number && currentCard.name === card.name && this.gameData.currentPlayer !== this.playerId) || (currentCard.name.includes('+4') && card.name.includes('+4') || (currentCard.name.includes('+col') && card.name.includes('+col')))) {
        this.gameData.currentCard = card;
        this.gameData.turnSkip = true;
        if (card.number !== -1) {
          this.gameData.currentCard = card;
          removeCard();
          nextTurn();
          return;
        }
        if (card.name.includes('+2')) {
          this.gameData.currentCard = card;
          this.gameData.cardStack += 2;
          removeCard();
          nextTurn(1, true);
          return;
        }
  
        // Pass
        if (card.name.includes('Pass')) {
          this.gameData.currentCard = card;
          removeCard();
          nextTurn(2);
          return;
        }
  
        // Uno Reverse
        if (card.name.includes('Turn')) {
          this.gameData.currentCard = card;
          this.gameData.turnOrder *= -1;
          removeCard();
          nextTurn(this.gameData.players.length === 2 ? 0 : 1);
          return;
        }
  
        // +4
        if (card.name.includes('+4')) {
          const col = await pickColor();
          game.isPickingColor = false;
          card.color = col;
          this.gameData.currentCard = card;
          this.gameData.cardStack += 4;
          removeCard();
          nextTurn(1, true);
          return;
        }
  
        // color change
        if (card.name.includes('+col')) {
          const col = await pickColor();
          game.isPickingColor = false;
          card.color = col;
          this.gameData.currentCard = card;
          removeCard();
          nextTurn();
          return;
        }
        return;
      }

      // If it's not our turn return
      if (this.gameData.currentPlayer !== this.playerId) return;

      // If we are not currently picking a color
      if (this.isPickingColor) return;
      
      if (this.gameData.turnSkip === true) return;
      // For number cards
      if (card.number !== -1) {
        if (currentCard.color === card.color || card.number === currentCard.number) {
          this.gameData.currentCard = card;
          removeCard();
          nextTurn();
          return;
        }
        return;
      }

      // +2
      if (card.name.includes('+2')) {
        if (card.color === currentCard.color || currentCard.name.includes('+2')) {
          this.gameData.currentCard = card;
          this.gameData.cardStack += 2;
          removeCard();
          nextTurn(1, true);
          return;
        }
      }

      // Pass
      if (card.name.includes('Pass')) {
        if (card.color === currentCard.color || currentCard.name.includes('Pass')) {
          this.gameData.currentCard = card;
          
          removeCard();
          nextTurn(2);
          return;
        }
      }

      // Uno Reverse
      if (card.name.includes('Turn')) {
        if (card.color === currentCard.color || currentCard.name.includes('Turn')) {
          this.gameData.currentCard = card;
          this.gameData.turnOrder *= -1;

          removeCard();
          nextTurn(this.gameData.players.length === 2 ? 0 : 1);
          return;
        }
      }

      // +4
      if (card.name.includes('+4')) {
        const col = await pickColor();
        game.isPickingColor = false;
        card.color = col;
        this.gameData.currentCard = card;
        this.gameData.cardStack += 4;
        removeCard();
        nextTurn(1, true);
        return;
      }

      // color change
      if (card.name.includes('+col')) {
        const col = await pickColor();
        game.isPickingColor = false;
        card.color = col;
        this.gameData.currentCard = card;
        removeCard();
        nextTurn();
        return;
      }

    },
    pickRandomCard: function() {
      if (this.gameData.currentPlayer !== this.playerId) return;
      if (this.canSkip) return;
      this.client.cards.push(randomCard());
      updateSelfOnServer();
      this.canSkip = true;
      this.unoDeclared = false;
    },
    skipTurn: function() {
      if (this.canSkip) {
        nextTurn();
      }
    },
    declareUno: function() {
      this.unoDeclared = true;
    },
    log: function(...args) {
      console.log(...args);
      return false;
    },
    kick: function(index) {
      if (this.host) {
        this.gameData.players.splice(index, 1);
        let i = 0;
        for (const player of this.gameData.players) {
          player.id = i;
          i++;
        }
        updateGameOnServer();
      }
    }
  },
  computed: {
    otherPlayers: function() {
      return [...this.gameData.players.slice(this.playerId + 1), ...this.gameData.players.slice(0, this.playerId)];
    },
    playerCardsJustification: function() {
      const width = window.innerWidth;
      const nCards = this.client.cards.length;
      if (nCards * 125 >= width) return 'space-between';
      return 'center';
    },
    client: function() {
      return this.gameData.players[this.playerId];
    }
  },
  watch: {
    state: function(val) {
      if (val === 'game') resetOwnCards();
    }
  }
});

window.addEventListener('load', () => {
  const params = getAllUrlParams();
  if (params.game) {
    firebase.database().ref('games').once('value', (snap) => {
      const games = snap.val();
      let gameExists = false;
      for (const game in games) {
        if (game === params.game) {
          gameExists = true;
          break;
        }
      }
      
      if (!gameExists) {
        showPopup({
          header: 'Game not found.'
        }).then(() => {
          window.location.href = 'https://oskar-codes.github.io/uno-online';
        });
        return;
      }

      game.gameId = params.game;
      gameServerRef().once('value', (snap) => {

        const incomingGameData = snap.val();

        for (const player of incomingGameData.players) {
          if (!player.cards) {
            player.cards = [];
          }
        }
        if (!incomingGameData.winners) incomingGameData.winners = [];

        game.gameData = incomingGameData;
        const playerIndex = game.gameData.players.length;

        if (game.gameData.started) {
          showPopup({
            header: 'Game has already started.'
          }).then(() => {
            window.location.href = 'https://oskar-codes.github.io/uno-online';
          });
          return;
        }
        
        const localName = localStorage.getItem("uno-online-name");
        let name = `Guest ${playerIndex + 1}`;
        if (localName && localName.trim()) {
          let nameAvailable = true;
          for (const player of game.gameData.players) {
            if (player.name === localName) {
              nameAvailable = false;
              break;
            }
          }
          if (nameAvailable) name = localName;
        }
        game.state = 'lobby';
        game.playerId = playerIndex;
        const playerObj = {
          name: name,
          cards: stackReference.slice(0, nCards),
          id: playerIndex
        }

        game.gameData.players.push(playerObj);

        updateSelfOnServer().then(() => {
          gameServerRef().on('value', handleGameUpdate);
        });
      });
    });
  }
});

function gameServerRef(query) {
  if (query)
    return firebase.database().ref(`games/${game.gameId}/${query}`);
  return firebase.database().ref(`games/${game.gameId}`);
}

function resetOwnCards() {
  shuffle(stackReference);
  game.client.cards = stackReference.slice(0, nCards);
  updateSelfOnServer();
}

function handleGameUpdate(snap) {
  const incomingGameData = snap.val();

  isInGame = false;
  for (const player of incomingGameData.players) {
    if (!player.cards) {
      player.cards = [];
    }
    if (player.name === game.client.name) {
      isInGame = true;
    }
  }
  if (!isInGame) {
    showPopup({
      header: `The host (${incomingGameData.players[0].name}) kicked you from the server.`
    }).then(() => {
      window.location.href = 'https://oskar-codes.github.io/uno-online';
    });
  }

  if (!incomingGameData.winners) incomingGameData.winners = [];

  if (incomingGameData.started && game.state !== 'game') {
    game.state = 'game';
  }
  
  if (incomingGameData.winners.length > game.gameData.winners.length) {
    showPopup({
      header: `${incomingGameData.winners[incomingGameData.winners.length - 1]} won the game!`
    }).then(() => {
      game.state = 'lobby';
    });

  }
  
  game.gameData = incomingGameData;

  window.setTimeout(() => {
    const el = Array.from(document.querySelectorAll('.other-player-cards')).find(e => e.classList.contains('active'));
    if (el) {
      el.scrollIntoView({behavior: "smooth", block: 'center'});
    }
  });
}

function updateSelfOnServer() {
  return gameServerRef(`players/${game.playerId}`).set(game.client);
}

function updateGameOnServer() {
  return gameServerRef().set(game.gameData);
}

function nextTurn(n = 1, addedCards) {

  game.canSkip = false;
  game.gameData.turnSkip = false;
  if (!addedCards) {
    for (let i = 0; i < game.gameData.cardStack; i++) {
      game.client.cards.push(randomCard());
    }
    game.gameData.cardStack = 0;
  }

  n *= game.gameData.turnOrder;

  const nPlayers = game.gameData.players.length;
  const dist = game.playerId + n;
  if (dist < 0) {
    game.gameData.currentPlayer = nPlayers + dist;
  } else {
    game.gameData.currentPlayer = (game.playerId + n) % nPlayers;
  }

  updateGameOnServer().then(() => {
    checkEndOfGame();
  })
}

function checkEndOfGame() {
  if (game.client.cards.length === 0 && game.gameData.cardStack === 0) {
    
    // Win and reset game
    showPopup({
      header: 'You won!'
    });
    game.state = 'lobby';

    game.gameData.winners.push(game.client.name);
    game.gameData.cardStack = 0;
    game.gameData.turn = 0;
    game.gameData.started = false;
    game.gameData.currentPlayer = 0;
    game.gameData.turnOrder = 1;

    const num = Math.floor(Math.random() * 9);
    const col = colors[Math.floor(Math.random() * 4)];
    game.gameData.currentCard = {
      name: `${col}${num}`,
      number: num,
      color: col
    }
    
    updateGameOnServer();

  }
}

function pickColor() {
  game.isPickingColor = true;

  return new Promise(function(resolve, reject) {

    const buttons = document.querySelectorAll('.color-picker button');

    for (const button of buttons) {
      button.addEventListener('click', () => {
        resolve(button.getAttribute('class'));
      });
    }

  });
}

function showPopup({ header, paragraph, type, placeholder }) {
  return new Promise((resolve) => {

    const closePopup = () => {
      document.body.removeChild(div);
      document.body.removeChild(background);
    }

    const div = document.createElement('div');
    div.classList.add('popup');

    const background = document.createElement('div');
    background.classList.add('popup-background');

    const h3 = document.createElement('h3');
    h3.textContent = header;

    const p = document.createElement('p');
    if (paragraph) p.textContent = paragraph;

    const buttons = document.createElement('div');

    const input = document.createElement('input');
    if (type === 'text') {
      if (placeholder) input.setAttribute('placeholder', placeholder);

      const cancel = document.createElement('button');
      cancel.classList.add('red');
      cancel.textContent = 'Cancel';

      cancel.addEventListener('click', () => {
        resolve(null);
        closePopup();
      });

      const confirm = document.createElement('button');
      confirm.classList.add('green');
      confirm.textContent = 'Confirm';

      confirm.addEventListener('click', () => {
        resolve(input.value);
        closePopup();
      });

      buttons.appendChild(cancel);
      buttons.appendChild(confirm);
    } else {
      const close = document.createElement('button');
      close.classList.add('yellow');
      close.textContent = 'Close';

      close.addEventListener('click', () => {
        resolve(null);
        closePopup();
      });

      buttons.appendChild(close);
    }

    div.appendChild(h3);
    if (paragraph) div.appendChild(p);
    if (type === 'text') div.appendChild(input);
    div.appendChild(buttons);

    document.body.appendChild(background);
    document.body.appendChild(div);
  });
}

function getAllUrlParams(url) {
  let queryString = url ? url.split('?')[1] : window.location.search.slice(1);
  const obj = {};
  if (queryString) {
    queryString = queryString.split('#')[0];
    const arr = queryString.split('&');
    for (var i = 0; i < arr.length; i++) {
      const a = arr[i].split('=');
      const paramName = a[0];
      const paramValue = typeof (a[1]) === 'undefined' ? true : a[1];
      if (paramName.match(/\[(\d+)?\]$/)) {
        let key = paramName.replace(/\[(\d+)?\]/, '');
        if (!obj[key]) obj[key] = [];
        if (paramName.match(/\[\d+\]$/)) {
          const index = /\[(\d+)\]/.exec(paramName)[1];
          obj[key][index] = paramValue;
        } else {
          obj[key].push(paramValue);
        }
      } else {
        if (!obj[paramName]) {
          obj[paramName] = paramValue;
        } else if (obj[paramName] && typeof obj[paramName] === 'string'){
          obj[paramName] = [obj[paramName]];
          obj[paramName].push(paramValue);
        } else {
          obj[paramName].push(paramValue);
        }
      }
    }
  }
  return obj;
}

function shuffle(array) {
  let currentIndex = array.length, randomIndex;

  // While there remain elements to shuffle...
  while (0 !== currentIndex) {

    // Pick a remaining element...
    randomIndex = Math.floor(Math.random() * currentIndex);
    currentIndex--;

    // And swap it with the current element.
    [array[currentIndex], array[randomIndex]] = [
      array[randomIndex], array[currentIndex]];
  }
}
