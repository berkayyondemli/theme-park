// Static game data: map size, attraction catalogue, staff, goals, park levels.
'use strict';

const TILE = 32;
const MAP_W = 40;
const MAP_H = 28;
const GATE_X = 20;
const GATE_Y = MAP_H - 1;

const PATH_COST = 15;
const OPEN_HOUR = 8;
const CLOSE_HOUR = 21;   // no new guests after this
const LEAVE_HOUR = 22;   // everyone heads home

const CATEGORIES = [
  { id: 'ride', label: 'Rides' },
  { id: 'shop', label: 'Food & Shops' },
  { id: 'facility', label: 'Facilities' },
  { id: 'tools', label: 'Paths & Tools' },
];

// Park levels unlock bigger attractions as lifetime earnings grow.
const LEVELS = [0, 6000, 18000, 40000, 80000, 150000];

// cat: ride | shop | facility
// For rides: price, capacity (riders per cycle), duration (seconds per cycle),
//   excitement (fun), intensity (thrill; timid guests skip high values).
// For shops/facilities: serves = need it satisfies, capacity = served at once,
//   duration = seconds to serve, itemCost = what each sale costs the park.
// passive: no customers; affects the area around it.
const DEFS = {
  // ---------- Rides ----------
  coaster: {
    name: 'Thunder Coaster', cat: 'ride', icon: '🎢', w: 7, h: 5, cost: 14000, price: 10,
    capacity: 12, duration: 14, excitement: 9, intensity: 8, upkeep: 120, needsOp: true, level: 0,
    desc: 'Loops, drops and screams. The headline act of any park.',
  },
  train: {
    name: 'Speed Train', cat: 'ride', icon: '🚄', w: 8, h: 4, cost: 9000, price: 6,
    capacity: 16, duration: 12, excitement: 6, intensity: 5, upkeep: 80, needsOp: true, level: 0,
    desc: 'A bullet train that rips around the track. Big capacity.',
  },
  jackpot: {
    name: 'Jackpot Games', cat: 'ride', icon: '🎰', w: 3, h: 3, cost: 4000, price: 5,
    capacity: 6, duration: 6, excitement: 4, intensity: 1, upkeep: 40, needsOp: true, level: 0, gamble: true,
    desc: 'Slots and prize games. Guests sometimes win, the house usually does.',
  },
  pool: {
    name: 'Splash Pool', cat: 'ride', icon: '🏊', w: 5, h: 4, cost: 6000, price: 4,
    capacity: 20, duration: 22, excitement: 5, intensity: 2, upkeep: 60, needsOp: false, level: 0, wet: true,
    desc: 'A small swimming park with a slide. Restores energy. No operator needed.',
  },
  carousel: {
    name: 'Magic Carousel', cat: 'ride', icon: '🎠', w: 3, h: 3, cost: 3500, price: 3,
    capacity: 12, duration: 10, excitement: 3, intensity: 1, upkeep: 30, needsOp: true, level: 0,
    desc: 'Gentle and charming. Every guest will ride it.',
  },
  bumper: {
    name: 'Bumper Cars', cat: 'ride', icon: '🚗', w: 4, h: 3, cost: 5500, price: 4,
    capacity: 8, duration: 10, excitement: 5, intensity: 3, upkeep: 45, needsOp: true, level: 1,
    desc: 'Crash into your friends. Legally.',
  },
  ferris: {
    name: 'Sky Wheel', cat: 'ride', icon: '🎡', w: 4, h: 4, cost: 8000, price: 5,
    capacity: 16, duration: 16, excitement: 5, intensity: 2, upkeep: 60, needsOp: true, level: 1,
    desc: 'The best view in town. Lights up beautifully at night.',
  },
  haunted: {
    name: 'Haunted Manor', cat: 'ride', icon: '👻', w: 4, h: 4, cost: 11000, price: 7,
    capacity: 10, duration: 14, excitement: 7, intensity: 4, upkeep: 70, needsOp: true, level: 2,
    desc: 'Creaky floors, flickering lights and something in the attic.',
  },
  droptower: {
    name: 'Drop Tower', cat: 'ride', icon: '🗼', w: 3, h: 3, cost: 13000, price: 8,
    capacity: 8, duration: 8, excitement: 8, intensity: 9, upkeep: 90, needsOp: true, level: 2,
    desc: 'Up 60 metres. Pause. Freefall.',
  },
  logflume: {
    name: 'Log Flume', cat: 'ride', icon: '🪵', w: 6, h: 4, cost: 18000, price: 9,
    capacity: 12, duration: 14, excitement: 7, intensity: 5, upkeep: 100, needsOp: true, level: 3, wet: true,
    desc: 'Float, climb, then SPLASH. Everyone gets wet.',
  },
  rocket: {
    name: 'Rocket to the Moon', cat: 'ride', icon: '🚀', w: 4, h: 4, cost: 35000, price: 16,
    capacity: 10, duration: 16, excitement: 10, intensity: 10, upkeep: 200, needsOp: true, level: 4,
    desc: 'An actual rocket launch. Probably safe.',
  },
  dragon: {
    name: 'Dragon Loop', cat: 'ride', icon: '🐉', w: 5, h: 5, cost: 60000, price: 20,
    capacity: 12, duration: 14, excitement: 12, intensity: 10, upkeep: 260, needsOp: true, level: 5,
    desc: 'A fire-breathing dragon spins riders upside down. Pure madness.',
  },

  // ---------- Food & Shops ----------
  icecream: {
    name: 'Ice Cream Shop', cat: 'shop', icon: '🍦', w: 2, h: 2, cost: 1500, price: 3, itemCost: 1,
    serves: ['thirst', 'hunger'], amount: { thirst: 45, hunger: 20 }, capacity: 2, duration: 2, upkeep: 20, level: 0,
    trash: true, item: 'icecream', color: '#ffb7d5', color2: '#ffffff',
    desc: 'Cold, sweet, and the top seller on a hot day.',
  },
  drinks: {
    name: 'Drinks Stall', cat: 'shop', icon: '🥤', w: 2, h: 1, cost: 900, price: 2, itemCost: 0.5,
    serves: ['thirst'], amount: { thirst: 70 }, capacity: 2, duration: 1.5, upkeep: 15, level: 0,
    trash: true, color: '#58c4f6', color2: '#ffffff',
    desc: 'Lemonade and soda. Thirsty guests are grumpy guests.',
  },
  burger: {
    name: 'Burger Bar', cat: 'shop', icon: '🍔', w: 2, h: 2, cost: 1800, price: 5, itemCost: 2,
    serves: ['hunger'], amount: { hunger: 60 }, capacity: 2, duration: 3, upkeep: 25, level: 0,
    trash: true, color: '#f5a623', color2: '#d0021b',
    desc: 'Quick, greasy and very popular.',
  },
  candy: {
    name: 'Cotton Candy', cat: 'shop', icon: '🍭', w: 2, h: 1, cost: 1100, price: 3, itemCost: 0.8,
    serves: ['hunger'], amount: { hunger: 15 }, happy: 8, capacity: 2, duration: 1.5, upkeep: 15, level: 0,
    trash: true, color: '#f78fd0', color2: '#a0e7ff',
    desc: 'Pure sugar, pure joy.',
  },
  toystore: {
    name: 'Toy Store', cat: 'shop', icon: '🧸', w: 3, h: 2, cost: 3500, price: 12, itemCost: 4,
    serves: ['toy'], amount: {}, happy: 18, capacity: 3, duration: 3, upkeep: 35, level: 0,
    item: 'teddy', color: '#9b6dff', color2: '#ffd84d',
    desc: 'Teddies and souvenirs. Guests carry them around all day.',
  },
  balloon: {
    name: 'Balloon Cart', cat: 'shop', icon: '🎈', w: 1, h: 1, cost: 700, price: 3, itemCost: 0.5,
    serves: ['toy'], amount: {}, happy: 10, capacity: 1, duration: 1, upkeep: 10, level: 0,
    item: 'balloon', color: '#ff5f6d', color2: '#ffffff',
    desc: 'Every kid needs a balloon.',
  },
  pizza: {
    name: 'Pizza Parlor', cat: 'shop', icon: '🍕', w: 3, h: 2, cost: 3200, price: 7, itemCost: 2.5,
    serves: ['hunger'], amount: { hunger: 75 }, capacity: 4, duration: 4, upkeep: 40, level: 1,
    trash: true, color: '#e8434f', color2: '#2e9e5b',
    desc: 'Wood-fired slices with seating inside.',
  },
  restaurant: {
    name: 'Grand Restaurant', cat: 'shop', icon: '🍽️', w: 4, h: 3, cost: 6000, price: 14, itemCost: 5,
    serves: ['hunger', 'thirst', 'energy'], amount: { hunger: 95, thirst: 50, energy: 30 }, happy: 10,
    capacity: 8, duration: 8, upkeep: 70, level: 1, color: '#2b5f8a', color2: '#f2b84b',
    desc: 'A sit-down meal. Guests leave full, rested and happy.',
  },
  coffee: {
    name: 'Coffee Cart', cat: 'shop', icon: '☕', w: 1, h: 1, cost: 800, price: 3, itemCost: 0.8,
    serves: ['energy', 'thirst'], amount: { energy: 35, thirst: 25 }, capacity: 1, duration: 1.5, upkeep: 10, level: 1,
    trash: true, color: '#7a4e2d', color2: '#f1e3c8',
    desc: 'A jolt of energy for tired guests.',
  },

  // ---------- Facilities ----------
  restroom: {
    name: 'Restrooms', cat: 'facility', icon: '🚻', w: 2, h: 2, cost: 1000, price: 0,
    serves: ['bladder'], amount: { bladder: 100 }, capacity: 3, duration: 3, upkeep: 15, level: 0,
    color: '#4a90d9', color2: '#ffffff',
    desc: 'Guests who can\'t find one get very unhappy.',
  },
  bench: {
    name: 'Bench', cat: 'facility', icon: '🪑', w: 1, h: 1, cost: 80, price: 0,
    serves: ['energy'], amount: { energy: 45 }, capacity: 2, duration: 5, upkeep: 0, level: 0,
    desc: 'Tired guests sit here to rest their feet.',
  },
  bin: {
    name: 'Trash Bin', cat: 'facility', icon: '🗑️', w: 1, h: 1, cost: 60, upkeep: 0, level: 0, passive: true,
    desc: 'Guests nearby throw rubbish in here instead of on the path.',
  },
  tree: {
    name: 'Tree', cat: 'facility', icon: '🌳', w: 1, h: 1, cost: 40, upkeep: 0, level: 0, passive: true, scenery: 1,
    desc: 'Shade and greenery. Guests like a pretty park.',
  },
  flowers: {
    name: 'Flower Bed', cat: 'facility', icon: '🌷', w: 1, h: 1, cost: 50, upkeep: 0, level: 0, passive: true, scenery: 1.5,
    desc: 'A splash of colour along the paths.',
  },
  fountain: {
    name: 'Fountain', cat: 'facility', icon: '⛲', w: 2, h: 2, cost: 900, upkeep: 5, level: 0, passive: true, scenery: 5,
    desc: 'A centrepiece that makes nearby guests happier.',
  },
  stage: {
    name: 'Show Stage', cat: 'facility', icon: '🎭', w: 3, h: 2, cost: 2500, upkeep: 20, level: 1, passive: true, scenery: 4,
    desc: 'Your shows earn double tips when you perform next to a stage.',
  },
};

const BUILD_ORDER = {
  ride: ['coaster', 'train', 'jackpot', 'pool', 'carousel', 'bumper', 'ferris', 'haunted', 'droptower', 'logflume', 'rocket', 'dragon'],
  shop: ['icecream', 'drinks', 'burger', 'candy', 'toystore', 'balloon', 'pizza', 'restaurant', 'coffee'],
  facility: ['restroom', 'bench', 'bin', 'tree', 'flowers', 'fountain', 'stage'],
};

const STAFF_TYPES = {
  operator: { label: 'Ride Operator', hire: 300, wage: 60, color: '#2f6fe0', icon: '🎟️' },
  cleaner: { label: 'Cleaner', hire: 200, wage: 40, color: '#2e9e5b', icon: '🧹' },
};

const STAFF_NAMES = ['Mia', 'Leo', 'Zara', 'Omar', 'Ivy', 'Kai', 'Nora', 'Theo', 'Luna', 'Eli', 'Rosa', 'Finn',
  'Ayla', 'Hugo', 'Esme', 'Jonas', 'Lea', 'Ravi', 'Sofia', 'Milo', 'Ada', 'Emre', 'Nina', 'Tom'];
const GUEST_NAMES = ['Alex', 'Sam', 'Jamie', 'Charlie', 'Robin', 'Taylor', 'Jordan', 'Casey', 'Riley', 'Quinn',
  'Avery', 'Harper', 'Rowan', 'Elif', 'Deniz', 'Yuki', 'Priya', 'Mateo', 'Chloe', 'Noah', 'Ella', 'Lucas',
  'Maya', 'Ben', 'Aria', 'Oscar', 'Isla', 'Max', 'Zoe', 'Arda', 'Can', 'Ece', 'Lina', 'Hana', 'Ivan', 'Pablo'];

// Goals give a cash reward when completed.
const GOALS = [
  { id: 'guests25', text: 'Welcome 25 guests', reward: 500, check: g => g.guestsTotal >= 25 },
  { id: 'icecream', text: 'Open an Ice Cream Shop', reward: 600, check: g => hasBuilding(g, 'icecream') },
  { id: 'restroom', text: 'Build Restrooms', reward: 400, check: g => hasBuilding(g, 'restroom') },
  { id: 'show', text: 'Perform your first show', reward: 300, check: g => g.showsDone >= 1 },
  { id: 'toys', text: 'Open a Toy Store', reward: 800, check: g => hasBuilding(g, 'toystore') },
  { id: 'earn10k', text: 'Earn $10,000 in total', reward: 1000, check: g => g.lifetime >= 10000 },
  { id: 'restaurant', text: 'Open a Grand Restaurant', reward: 1500, check: g => hasBuilding(g, 'restaurant') },
  { id: 'staff8', text: 'Grow your team to 8 staff', reward: 800, check: g => g.staff.length >= 8 },
  { id: 'rating90', text: 'Reach a park rating of 90% with 50+ guests', reward: 2500, check: g => g.rating >= 90 && g.guests.length >= 50 },
  { id: 'guests120', text: 'Have 120 guests in the park at once', reward: 3000, check: g => g.guests.length >= 120 },
  { id: 'rides8', text: 'Run 8 different rides', reward: 4000, check: g => g.buildings.filter(b => DEFS[b.type].cat === 'ride').length >= 8 },
  { id: 'rocket', text: 'Launch the Rocket to the Moon', reward: 8000, check: g => hasBuilding(g, 'rocket') },
  { id: 'dragon', text: 'Tame the Dragon Loop', reward: 15000, check: g => hasBuilding(g, 'dragon') },
  { id: 'legend', text: 'Earn $500,000 in total. Legendary park!', reward: 50000, check: g => g.lifetime >= 500000 },
];

function hasBuilding(g, type) { return g.buildings.some(b => b.type === type); }
