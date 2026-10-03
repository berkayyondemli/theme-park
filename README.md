# Showtime Park

A theme park tycoon game that runs in the browser. You're the Entertainer and the park is your business: keep guests happy, earn money, and use it to build bigger and crazier attractions.

## Play

Open `index.html` in a browser. No build step or install needed.

To serve it locally instead (some browsers restrict `file://` storage):

```sh
python3 -m http.server 8000
# then visit http://localhost:8000
```

## What you start with

- **Thunder Coaster**, **Speed Train**, **Jackpot Games** and a **Splash Pool**
- A team of five: three ride operators (coaster, train, jackpot) and two cleaners
- $8,000 in cash and a small path network with room to grow

## How it works

- **Guests** pay an entry fee, then ride, eat, shop and use the restrooms. Each guest has happiness, hunger, thirst, toilet and energy needs, and a thrill tolerance that decides which rides they'll try. Click any guest to see what they're thinking.
- **Rides** need an operator standing at the entrance to run. The pool is self-service.
- **Cleaners** sweep the litter guests drop. Trash bins nearby stop guests littering in the first place.
- **You, the Entertainer** can walk the park and perform shows. Guests gather round, cheer up and throw tips. Shows next to a Show Stage earn double tips.
- **Fireworks** and **ad campaigns** cost money but bring more guests.
- **Prices** are yours to set per ride/shop, plus the park entry fee. Charge too much and guests refuse.
- **Every midnight** you pay wages and upkeep and get a daily report. The game autosaves then.
- **Park levels** rise with total earnings and unlock new attractions: Bumper Cars, Sky Wheel, Pizza Parlor, Grand Restaurant, Haunted Manor, Drop Tower, Log Flume, Rocket to the Moon and the Dragon Loop.
- **Goals** pay cash rewards.

## Controls

| Input | Action |
| --- | --- |
| Drag / arrow keys / WASD | Move around the park |
| Mouse wheel / pinch | Zoom |
| Click | Inspect a ride, shop, guest or staff member |
| Space | Pause / resume |
| 1, 2, 3 | Game speed |
| P / B | Path tool / bulldozer |
| Esc or right-click | Cancel the current tool |

## Code layout

| File | Purpose |
| --- | --- |
| `js/defs.js` | Attraction catalogue, staff types, goals and park levels |
| `js/sim.js` | Simulation: guests, staff, entertainer, rides, economy, save/load |
| `js/render.js` | Canvas drawing for the map, every attraction, people and lighting |
| `js/ui.js` | HUD, build tray, inspector panel and dialogs |
| `js/main.js` | Game loop, camera and input |
