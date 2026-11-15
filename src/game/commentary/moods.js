// Emotional delivery for the commentary. Each event has a mood; the mood shapes
// pitch, speed and volume, and how much they climb phrase by phrase.

export const MOODS = {
  //        pitch  rate  volume  climb (per phrase)  emoji
  chill: { pitch: 1.0, rate: 1.02, volume: 0.9, climb: 0.0, emoji: '🎙️' },
  tense: { pitch: 1.08, rate: 1.16, volume: 1, climb: 0.05, emoji: '😬' },
  hype: { pitch: 1.2, rate: 1.16, volume: 1, climb: 0.07, emoji: '🔥' },
  shock: { pitch: 1.32, rate: 1.1, volume: 1, climb: -0.04, emoji: '😱' },
  scream: { pitch: 1.42, rate: 1.22, volume: 1, climb: 0.08, emoji: '🤯' },
  sarcastic: { pitch: 0.9, rate: 0.9, volume: 0.9, climb: -0.03, emoji: '💀' },
  sad: { pitch: 0.78, rate: 0.84, volume: 0.85, climb: -0.04, emoji: '😭' },
};

export const EVENT_MOOD = {
  kickoff: 'hype',
  running: 'chill',
  encounter: 'tense',
  encounterKeeper: 'scream',
  weapon_pistol: 'chill',
  weapon_shotgun: 'hype',
  weapon_rifle: 'hype',
  weapon_sniper: 'tense',
  hitBig: 'shock',
  headshot: 'scream',
  hpHalf: 'hype',
  hpLow: 'hype',
  missStreak: 'sarcastic',
  dodge: 'shock',
  windup: 'tense',
  stagger: 'hype',
  tackleTaken: 'shock',
  lowPossession: 'tense',
  reload: 'chill',
  ballBlocked: 'scream',
  throwHit: 'shock',
  enraged: 'scream',
  kill: 'scream',
  killKeeper: 'scream',
  replay: 'hype',
  finalRun: 'tense',
  goal: 'scream',
  defeat: 'sad',
  banter: 'hype',
  dance: 'scream',
  danceEnd: 'hype',
};

// Exclamations that can open a line, by mood.
export const INTERJECTIONS = {
  scream: ['OH MY DAYS!', 'NO WAY!', 'ARE YOU SERIOUS?!', "LET'S GOOO!", 'WHAT. A. MOMENT!'],
  shock: ['Ooh!', 'Oh no no no!', 'Wow!', 'Oof!'],
  hype: ['Come on!', 'Yes yes yes!', 'Here we go!'],
  sad: ['Oh dear...', 'Ohh...'],
  sarcastic: ['Hmm.', 'Okay...'],
  tense: ['Careful now!', 'Oh, watch out!'],
};

// The other commentator reacting straight after a big moment.
export const BANTER = {
  scream: [
    "HAHAHA! I'm screaming! Chat, did you SEE that?!",
    "No because WHY is he so good?!",
    'I literally jumped out of my seat!',
    'That was DISGUSTING. In the best way!',
    "Somebody clip that! CLIP IT!",
  ],
  shock: ['Ohhh, that one HURT.', "He's gonna feel that tomorrow.", 'Yikes. Big yikes.'],
  hype: ['Absolute scenes!', 'This kid is HIM.', "We're so back!"],
  sad: ["It's okay... it's okay. Actually no, it's not.", 'Pain. Just pain.'],
};
