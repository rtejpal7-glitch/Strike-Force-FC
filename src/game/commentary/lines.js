// Commentary lines, grouped by game event. {name} = opponent surname,
// {full} = full name, {dmg} = damage, {weapon} = weapon name.
// Two fictional commentators trade lines: "dev" (hype) and "zoe" (analyst).

export const COMMENTATORS = {
  dev: { name: 'Dev “No Cap” Malhotra', short: 'DEV', pitch: 1.05, rate: 1.12 },
  zoe: { name: 'Zoe “Aura” Clarke', short: 'ZOE', pitch: 1.25, rate: 1.05 },
};

export const LINES = {
  kickoff: [
    ['dev', "And we're LIVE! Our striker has the ball and absolutely zero plans to pass it."],
    ['zoe', 'Five defenders between him and the goal. Main character energy is off the charts.'],
    ['dev', "Kick-off! He's dribbling like the ball owes him money."],
  ],
  running: [
    ['zoe', 'Look at that first touch. Silky. Buttery. Bussin, honestly.'],
    ['dev', "He's not running, he's aura farming down the pitch."],
    ['zoe', "No passing, no teammates, no fear. It's giving solo queue."],
    ['dev', 'The ball is glued to his boots. Lowkey he and the ball are in a situationship.'],
    ['zoe', 'Pure vibes and forward momentum. This is a TED talk on dribbling.'],
  ],
  encounter: [
    ['dev', "Here comes {name}, and he's looking for problems!"],
    ['zoe', '{name} steps up. Bro really thought he could just walk up and take the ball.'],
    ['dev', "{name} closes in. Lock in, king — it's go time!"],
    ['zoe', "{name} is pressing. Somebody's about to get cooked and I don't think it's our guy."],
  ],
  encounterKeeper: [
    ["dev", "Here he is... The Wall. Viktor Brandt. Seven hundred health. Zero mercy. This is it, chat. THIS. IS. IT!"],
    ['dev', "It's the final boss! {full}! This man has never let anyone score. Ever. No cap."],
    ['zoe', "The Wall is off his line. Two metres of pure gatekeeping energy. Literally."],
  ],
  weapon_pistol: [
    ['zoe', 'Pistol out. Simple, reliable, classic. A day-one essential.'],
    ['dev', 'Going with the pistol. Minimalist king.'],
  ],
  weapon_shotgun: [
    ['dev', "SHOTGUN! Oh it's giving close-range rizz!"],
    ['zoe', "Shotgun selected. Get close or it's a skill issue."],
  ],
  weapon_rifle: [
    ['dev', "Assault rifle! He's about to spray and pray, chat!"],
    ['zoe', 'Full auto. Very unserious. I respect it.'],
  ],
  weapon_sniper: [
    ['zoe', 'Sniper rifle. Patience. Precision. Big brain plays only.'],
    ['dev', 'He pulled out the SNIPER. This is about to be personal.'],
  ],
  hitBig: [
    ["zoe", "Oh that is NASTY! {dmg} damage! {name} is having the worst day of his life!"],
    ['dev', 'OHHH! {dmg} damage! {name} is dealing with SERIOUS aura loss!'],
    ['zoe', "{dmg} in one go. That's minus a thousand aura for {name}."],
    ['dev', 'Emotional damage! And physical damage! {dmg} of it!'],
    ['zoe', '{name} just took {dmg}. Respectfully, bro is cooked.'],
  ],
  headshot: [
    ["dev", "BOOM! Right between the eyes! {name} did NOT see that coming!"],
    ['dev', 'HEADSHOT! {name} got caught in 4K!'],
    ['zoe', 'Right on the noggin. {name} is having a very not-demure moment.'],
    ['dev', 'Clean headshot! Ate and left no crumbs!'],
    ['zoe', 'Headshot. That one is living rent free in {name}’s head now.'],
  ],
  hpHalf: [
    ['zoe', "{name} is down to half health. The vibes? Shifting."],
    ['dev', "Halfway there! {name}'s confidence is speedrunning to zero!"],
  ],
  hpLow: [
    ['dev', "{name} is on his last legs! He's one tap away from touching grass — permanently!"],
    ['zoe', '{name} is in critical condition. This is his villain-arc-ending era.'],
  ],
  missStreak: [
    ["dev", "Bro... bro, please. He is aiming at the clouds. The clouds are fine, by the way."],
    ['zoe', "That's a lot of missing. Respectfully, skill issue."],
    ['dev', "Bro is hitting everything except {name}. The air is getting destroyed!"],
    ['zoe', "The pitch is taking more damage than {name} right now. Lock in!"],
  ],
  dodge: [
    ['dev', '{name} dodges! Ankles intact! Okay, he’s kinda built different.'],
    ['zoe', 'Side-step from {name}. Annoying? Yes. Effective? Also yes.'],
  ],
  windup: [
    ['dev', "Uh oh — {name} is winding up! He's about to send it!"],
    ['zoe', "Tackle incoming! Shoot him NOW or it's over for the ball."],
  ],
  stagger: [
    ["zoe", "WHAT a read! He saw the tackle coming and said NOT TODAY!"],
    ['zoe', 'Tackle interrupted! {name} got stopped mid-yap.'],
    ['dev', "STAGGERED! {name} said ‘nah I'm good’ halfway through the tackle!"],
  ],
  tackleTaken: [
    ['dev', 'OOF! He got clattered! That’s a W for {name}, unfortunately.'],
    ['zoe', 'Brutal tackle. Ball control taking an L. Somebody check on him.'],
    ['dev', "That tackle was so disrespectful. Ref? REF? Oh right, there's no ref."],
  ],
  lowPossession: [
    ['zoe', "Ball control is critical. One more hit and it's an L plus ratio."],
    ['dev', "He's hanging on by a thread, chat! Do NOT fumble this!"],
  ],
  reload: [
    ['zoe', 'Reloading. Even the GOATs need a minute.'],
    ['dev', 'Quick reload. Hydrate, reload, dominate.'],
  ],
  ballBlocked: [
    ["zoe", "He shot the ball! Out of the AIR! Is he even human?!"],
    ['dev', 'He SHOT THE BALL OUT OF THE AIR! That is CINEMA!'],
    ['zoe', 'Ball intercepted mid-flight. Reflexes? Unreal. Aura? Infinite.'],
  ],
  throwHit: [
    ['zoe', 'He wore that one. Ball to the chest. The Wall is cooking.'],
    ['dev', 'Ooh, that throw hit different. And by different I mean painfully.'],
  ],
  enraged: [
    ['dev', 'THE WALL IS MAD! He’s entering his unhinged era!'],
    ['zoe', 'Phase two activated. Brandt is fully delulu now — and faster.'],
  ],
  kill: [
    ["dev", "OH HE'S GONE! HE'S GONE! {name} is OUT COLD! Put some respect on this man's name!"],
    ["zoe", "Bye bye {name}! Don't let the turf hit you on the way down! Oh wait... it did!"],
    ['dev', '{name} IS DOWN! Sent straight to the shadow realm!'],
    ['zoe', '{name} has been deleted. Negative aura. Zero rizz. Gone.'],
    ['dev', 'AND {name} FOLDS! He folded like a lawn chair! The crowd is going FERAL!'],
    ['zoe', "{name} hits the deck. Understood the assignment? He didn't."],
    ['dev', "Down goes {name}! That's an NPC moment if I've ever seen one!"],
  ],
  killKeeper: [
    ["zoe", "HE BEAT THE WALL! Nobody beats the Wall! Somebody call his mum, she needs to see this!"],
    ['dev', "THE WALL HAS FALLEN! I REPEAT, THE WALL HAS FALLEN! THIS IS NOT A DRILL!"],
    ['zoe', 'Brandt is down. The final boss got speedrun. Absolute cinema.'],
  ],
  replay: [
    ['zoe', "Let's see that again. Look at the way he crumbles. Majestic."],
    ['dev', 'Replay! Slow it down — bro’s soul left his body in 4K!'],
    ['zoe', 'On the replay you can actually see the aura leaving him.'],
    ['dev', "Run it back! The crowd's going absolutely unhinged!"],
  ],
  finalRun: [
    ['dev', "Open goal! It's just him, the ball and destiny!"],
    ['zoe', 'Nobody left. Do not fumble this. I repeat — do NOT fumble.'],
  ],
  goal: [
    ["dev", "GOAL! GOAL! GOAL! HE HAS DONE IT! FROM ONE END TO THE OTHER! I HAVE NO WORDS! ACTUALLY I HAVE ONE: AURA!"],
    ["zoe", "Oh my days... Oh my DAYS! That is the greatest goal I have EVER seen! I'm actually crying, chat!"],
    ['dev', 'GOOOOOAL! HE SCORED! THAT IS THE MOST SIGMA GOAL IN HISTORY!'],
    ['zoe', 'GOAL! Five defenders, one keeper, zero passes. Absolute GOAT behaviour.'],
  ],
  dance: [
    ['dev', "OH HE'S DANCING! The man has MOVES! The whole stadium is vibing with him!"],
    ['zoe', 'Celebration mode activated. This is pure main character behaviour and I am HERE for it!'],
    ['dev', 'Drop the beat! He scores AND he can dance? Unfair. Genuinely unfair.'],
  ],
  danceEnd: [
    ['zoe', 'And THAT is how you celebrate! Ten out of ten. No notes.'],
    ['dev', 'What a performance! Somebody give this man a record deal!'],
  ],
  defeat: [
    ["zoe", "No... no, no, no. He was SO close. I need a minute, chat. I genuinely need a minute."],
    ['zoe', "And he's lost the ball. That's a massive L. Tough to watch."],
    ['dev', "NOOO! He fumbled! Somebody tell him it's gonna be okay — it's not, but tell him."],
  ],
};
