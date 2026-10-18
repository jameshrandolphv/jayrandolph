# Bat Out!

An arcade baseball game: one turn at bat (hitting), one turn on the mound (pitching), or a 3, 6 or 9 inning game
against the computer. You are the home team, so in a game you pitch the top of each inning and bat the bottom.

## Layout for porting

The rules are kept apart from the drawing, as in Chaos Park, so the iOS and Android ports can carry them over line
for line and check them against the same seeded runs.

| File                              | What it is                                                                                    | Platform code |
| --------------------------------- | --------------------------------------------------------------------------------------------- | ------------- |
| `camera.ts`                       | Pinhole cameras over the field (feet), projecting to the screen and back onto the plate       | none          |
| `constants.ts`                    | Field, fielders, throwing and running numbers                                                 | none          |
| `rng.ts`                          | Seeded random numbers (mulberry32)                                                            | none          |
| `pitch.ts`                        | Pitch types, their flight and break, the computer pitcher                                     | none          |
| `swipe.ts`                        | Reading a pitching swipe (type, speed, aim) and a batting swipe (timing, height, lift, power) | none          |
| `swing.ts`                        | Bat on ball: exit speed, launch and spray angles; the computer batter                         | none          |
| `flight.ts`                       | The batted ball's flight, bounces, the wall and home runs                                     | none          |
| `play.ts`                         | Fielding, throws and baserunning, with the force, tag-up and third-out rules                  | none          |
| `rules.ts`                        | Count, outs, bases, innings, line score, walk-offs and extra innings                          | none          |
| `sim.ts`                          | The 60 Hz game loop and its phases                                                            | none          |
| `game.ts`                         | Input, sound and high scores                                                                  | web           |
| `art.ts`, `view.ts`, `bat-out.ts` | Cartoon figures, the Pixi renderer and the Angular component                                  | web           |

Everything above `game.ts` uses only plain arithmetic and the seeded random source, so a port given the same seed
and inputs makes the same plays.

## Controls

- **Hitting**: swipe through the ball as it reaches the plate. The swing is read where the swipe crosses the line the
  pitch ends on: how early or late (pull or push), how far under or over the ball (fly ball or grounder), the swipe's
  slope (uppercut) and speed (power).
- **Pitching**: swipe up from the pitcher and let go where you want the pitch. Straight is a fastball (a changeup if
  slow), a hooked end a slider or (hooked harder) a curveball, flicking back down a sinker, and resting before
  letting go a knuckleball. Swipe speed sets pitch speed; faster pitches are less accurate.
