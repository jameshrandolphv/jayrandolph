# Changelog

## 1.8.3
- Chaos Park: "Your best" and its trophy are centred together on the title card
- Chaos Park: the how-to-play rules fit inside their notice board, with room under the last line for the button
- Chaos Park: the ball fields look like real ones, with a bigger clay infield arcing round the pitcher's mound, grass inside the base paths, clay round each base and home, and foul lines out to the edge of the grass
- Chaos Park: privacy policy and support pages for the app stores, at `/chaos-park/privacy` and `/chaos-park/support`, and an `app-ads.txt` for AdMob

## 1.8.2
- Bat Out! is switched off for now: it is gone from the desktop and the dock, and `/bat-out` no longer opens it. Its code is kept so it can come back

## 1.8.1
- Bat Out!: much easier to hit. A swipe now meets the ball where you see it; before, it was checked against where the pitch would end up, so swiping through the ball a moment early went over it. Your bat is also wider and more forgiving of timing than the computer's
- Bat Out!: a gold ring on the plate shows roughly where each pitch is heading, and a soft band round your swipe shows how wide your bat is
- Bat Out!: full screen now fills the whole screen instead of leaving a gap on the right
- The dock shows the desktop and the three newest apps, so it fits on a phone; the rest are on the desktop

## 1.8.0
- Added Bat Out!, an arcade baseball game drawn in Chaos Park's cartoon style, seen through the batter's or the pitcher's eyes: swipe through the pitch to hit it, or swipe up from the pitcher to throw (a straight flick for a fastball, a hook for a slider or curveball, a flick back down for a sinker, a pause for a knuckleball)
- Five ways to play from the menu: one turn at bat, one turn on the mound, or a 3, 6 or 9 inning game against the computer with a line score at every change of sides, walk-offs and extra innings
- Every ball in play is fielded by the defence by the rules: fly outs, line outs, ground outs, double plays, sac flies, runners tagging up and taking extra bases, singles to home runs and grand slams

## 1.7.6
- Chaos Park: no more hedge round the screen, and the park now takes the exact shape of the screen however long or square it is (it used to stop at twice as long as wide, leaving city showing beside it on phones held sideways)
- Chaos Park: on long, narrow screens the road reaches both ends, as a rounded rectangle, instead of shrinking to a small oval in the middle

## 1.7.5
- Chaos Park gets a park look of its own instead of Flights!' borrowed menus: wooden noticeboard cards, green and wood sign buttons, a round green pause button, a hedge round the screen, and a yellow "!" bubble with a bike-bell ding for anyone about to collide
- Chaos Park wording: "Pile-up!" on game over, "New park record!" with a trophy for a new best, "BEST" and "YOUR BEST" for the high score, and "Taking a breather" when paused

## 1.7.4
- Chaos Park plays at 70% of its old speed, cars are only a little faster than bikes, only one car is in the park at a time, and run groups come as soon as the score reaches 10, then every 45 to 65 seconds

## 1.7.3
- Chaos Park builds a park about 10 times faster and World's Longest Game builds a level about 45% faster, with exactly the same parks and levels as before, so the game generator tests no longer time out
- Tests: the road-fits-the-frame park check makes one assertion per park instead of one per point of road, and the three World's Longest Game tests that build 18 to 30 whole levels get the same 60s limit as the other heavy generator tests

## 1.7.2
- Flights!: a simpler game-over card with just the headline, your landing count and the buttons

## 1.7.1
- Flights!: a simpler title card with just the name in script, a reworded how-to-play and a cleaner app icon

## 1.7.0
- Chaos Park: the park fills the screen, with wider lanes and bigger sprites on small devices; runs end on the third collision (the first two stun whoever was hit); slippery patches appear at 25, 50 and 100 points

## 1.6.3
- World's Longest Game keeps every room in rhythm: all of a room's enemies move to one beat and fall back into step within a few loops (two in the first levels), instead of drifting slowly out of sync
- Gentler first levels: slower enemies, new patterns and layouts introduced more gradually, a free square to stand in between pairs of lanes, and fewer odd extra enemies filling gaps; no room can ever be walked through without meeting an enemy

## 1.6.2
- Chaos Park: one slippery patch per park instead of two; bikers shout "Out of my way!" when closing in on someone on foot
- World's Longest Game eases in more gently: fewer enemies and roomier lanes in the first levels, no stationary dots before level 10, and stationary dots never placed right beside the start, checkpoints or finish

## 1.6.1
- Chaos Park: two small slippery patches in every season (ice, puddles, mud or leaf piles), rare run groups of 6 to 12 runners, rats that bite and daze people, and a rewritten how-to-play card

## 1.6.0
- Added Chaos Park, a lane-swiping traffic game on a randomly generated park loop, with a random season every play (and ice in winter); swipe a mover forward to speed it up and back to slow it down

## 1.5.2
- Flights! fills its window and can be maximized, with a flash where a flight path snaps onto its runway, centred score counters and a redrawn stewardess

## 1.5.1
- File menu in the menu bar while a photo is open; the menu bar shows Finder instead of long folder names
- Fixed setting a photo you had already viewed as the wallpaper (or opening it in Film Sim) failing in Safari
- Fixed a stutter when tapping in Flappy Cat; taller, higher arrow keys in World's Longest Game

## 1.5.0
- Added Flights!, an air traffic control game with a new airfield every play

## 1.4.2
- Can now set wallpaper from photos; World's Longest Game bug fixes

## 1.4.1
- Bug fixes

## 1.4.0
- Photos are now served from an S3 bucket; added all scanned film photos

## 1.3.3
- Increased difficulty and variety of levels generated in WLG

## 1.3.2
- Fixed a frame delay on high refresh screens for Flappy Cat; swapped to a d-pad in World's Longest Game

## 1.3.1
- World's Longest Game difficulty and gameplay adjustments

## 1.3.0
- Added World's Longest Game; Flappy Cat bug fixes

## 1.2.1
- Fixed some issues with Flappy Cat

## 1.2.0
- Added Flappy Cat and Text Edit

## 1.1.0
- Added Film Sim app and Finder

## 1.0.0
- Initial site layout
