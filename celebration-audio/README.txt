CELEBRATION AUDIO
=================

Drop your own audio clips in this folder. They appear automatically in the
celebration menu after you score.

Supported formats: .mp3 .wav .ogg .m4a .aac .flac .webm .opus
(any format your browser can play)

- The file name becomes the clip title. For example, "my-goal-song.mp3" shows as "My Goal Song".
- No code changes or restarts are needed. While the celebration screen is open,
  the list refreshes every few seconds, so a clip you add appears straight away.
- Songs with a clear beat work best: the dance locks onto the beat.

This needs the game to be served by its local server (opening play.html by
double-clicking can't read folders):

    npm run dev       (development, with live reload)
    npm run play      (quick start: serves play.html; open http://localhost:8080)

If you open play.html directly, use "Load folder" on the celebration screen to
pick this folder by hand.

demo-stadium-beat.wav is a sample clip (128 BPM). Delete it if you don't want it.
