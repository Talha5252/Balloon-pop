<script lang="ts">
  import { goto } from '$app/navigation';
  import { base } from '$app/paths';
  import { onMount, onDestroy } from 'svelte';
  import { supabase } from '$lib/supabase';

  // Game state type definitions
  type GameState = 'countdown' | 'playing' | 'wave_transition' | 'gameover' | 'paused';
  
  interface Balloon {
    id: number;
    x: number;          // Left position in % (5 to 90)
    size: number;       // Width in pixels
    speed: number;      // CSS transition duration in seconds
    color: string;      // Tailwind/HSL color values
    type: 'normal' | 'fast' | 'bonus' | 'bomb';
    points: number;
    popped: boolean;
  }

  interface Particle {
    id: number;
    x: number;
    y: number;
    tx: number;         // Target offset X
    ty: number;         // Target offset Y
    color: string;
    size: number;
  }

  // Svelte 5 Runes for highly reactive game states
  let username = $state('Player');
  let score = $state(0);
  let wave = $state(1);
  let lives = $state(3);
  let gameState = $state<GameState>('countdown');
  let countdownVal = $state(3);
  
  let balloons = $state<Balloon[]>([]);
  let particles = $state<Particle[]>([]);
  
  let isMuted = $state(false);
  let screenFlash = $state(false);
  let isNewHighScore = $state(false);
  let leaderboard = $state<Array<{ name: string; score: number; wave: number; date: string }>>([]);

  // Wave manager tracking
  let spawnedInWave = $state(0);
  let totalInWave = $state(10);
  let activeBalloonsCount = $derived(balloons.filter(b => !b.popped).length);

  // Timers and references
  let spawnIntervalId: any = null;
  let countdownIntervalId: any = null;
  let particleIdCounter = 0;
  let balloonIdCounter = 0;
  let audioCtx: AudioContext | null = null;

  // Initialize Web Audio Context safely
  const getAudioContext = () => {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    return audioCtx;
  };

  // Synthesize game sounds using Web Audio API
  const playSound = (type: 'beep' | 'start' | 'pop' | 'escape' | 'wave_clear' | 'gameover' | 'bomb') => {
    if (isMuted) return;
    try {
      const ctx = getAudioContext();
      const now = ctx.currentTime;

      if (type === 'beep') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(440, now); // A4
        gain.gain.setValueAtTime(0.1, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.1);
        osc.start(now);
        osc.stop(now + 0.1);
      } 
      
      else if (type === 'start') {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(880, now); // A5
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      } 
      
      else if (type === 'pop') {
        // High frequency pitch sweep down + pop envelope
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(600, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.12);
        
        gain.gain.setValueAtTime(0.2, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } 

      else if (type === 'bomb') {
        // Deep explosion sound
        const osc = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'sawtooth';
        osc2.type = 'triangle';
        
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(20, now + 0.4);
        osc2.frequency.setValueAtTime(60, now);
        osc2.frequency.linearRampToValueAtTime(10, now + 0.4);
        
        gain.gain.setValueAtTime(0.3, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
        
        osc.start(now);
        osc2.start(now);
        osc.stop(now + 0.4);
        osc2.stop(now + 0.4);
      }
      
      else if (type === 'escape') {
        // Unhappy descending tone
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'sine';
        osc.frequency.setValueAtTime(220, now);
        osc.frequency.linearRampToValueAtTime(110, now + 0.25);
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.exponentialRampToValueAtTime(0.01, now + 0.25);
        osc.start(now);
        osc.stop(now + 0.25);
      } 
      
      else if (type === 'wave_clear') {
        // Play an upbeat arpeggio
        const notes = [261.63, 329.63, 392.00, 523.25]; // C4, E4, G4, C5
        notes.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now + idx * 0.08);
          gain.gain.setValueAtTime(0.1, now + idx * 0.08);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.08 + 0.2);
          osc.start(now + idx * 0.08);
          osc.stop(now + idx * 0.08 + 0.2);
        });
      } 
      
      else if (type === 'gameover') {
        // Dramatic descending minor chords
        const chords = [196.00, 164.81, 130.81]; // G3, E3, C3 minor outline
        chords.forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.connect(gain);
          gain.connect(ctx.destination);
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now + idx * 0.15);
          osc.frequency.linearRampToValueAtTime(freq * 0.8, now + idx * 0.15 + 0.6);
          gain.gain.setValueAtTime(0.12, now + idx * 0.15);
          gain.gain.exponentialRampToValueAtTime(0.001, now + idx * 0.15 + 0.6);
          osc.start(now + idx * 0.15);
          osc.stop(now + idx * 0.15 + 0.6);
        });
      }
    } catch (e) {
      console.warn('Audio Context failed to trigger sound effect:', e);
    }
  };

    // Hintergrundmusik-Referenz
  let bgMusic: HTMLAudioElement | null = null;

  const startBackgroundMusic = () => {
    // Wenn die Musik bereits geladen ist, einfach abspielen
    if (bgMusic) {
      if (!isMuted && gameState === 'playing') {
        bgMusic.play().catch(e => console.warn('Audio autoplay blocked:', e));
      }
      return;
    }
    
    try {
      // Lädt die Datei aus dem /static/ Ordner, kompatibel mit GitHub Pages mit Cache-Buster!
      bgMusic = new Audio(`${base}/music.mp3?v=${Date.now()}`);
      bgMusic.loop = true; // Musik wiederholt sich endlos
      bgMusic.volume = 0.25; // Lautstärke auf 25% (angenehm im Hintergrund)

      if (!isMuted && gameState === 'playing') {
        bgMusic.play().catch(e => console.warn('Audio autoplay blocked:', e));
      }
    } catch (e) {
      console.warn('Fehler beim Laden der Musikdatei:', e);
    }
  };

  const stopBackgroundMusic = () => {
    if (bgMusic) {
      bgMusic.pause();
    }
  };

  onMount(() => {
    // Read session/local storage for player info
    const storedUsername = sessionStorage.getItem('balloonUsername') || localStorage.getItem('balloonUsername');
    if (storedUsername) {
      username = storedUsername;
    } else {
      // If direct access, redirect back to login
      goto(`${base}/`);
      return;
    }

    const storedAudio = localStorage.getItem('balloonAudioEnabled');
    if (storedAudio !== null) {
      isMuted = storedAudio !== 'true';
    }

    // Begin Countdown
    startCountdown();
  });

  onDestroy(() => {
    clearTimers();
  });

  const clearTimers = () => {
    if (spawnIntervalId) clearInterval(spawnIntervalId);
    if (countdownIntervalId) clearInterval(countdownIntervalId);
    stopBackgroundMusic();
  };

  const pauseGame = () => {
    if (gameState !== 'playing') return;
    gameState = 'paused';
    
    // Clear spawn loop to stop adding new balloons
    if (spawnIntervalId) {
      clearInterval(spawnIntervalId);
      spawnIntervalId = null;
    }
    
    // Stop ambient background music
    stopBackgroundMusic();
  };

  const resumeGame = () => {
    if (gameState !== 'paused') return;
    gameState = 'playing';
    
    // Resume spawning balloons
    const spawnDelay = Math.max(350, 1600 - wave * 130);
    spawnIntervalId = setInterval(() => {
      if (spawnedInWave < totalInWave) {
        spawnBalloon();
      } else {
        clearInterval(spawnIntervalId);
        spawnIntervalId = null;
      }
    }, spawnDelay);
    
    // Resume music
    startBackgroundMusic();
  };

  const startCountdown = () => {
    gameState = 'countdown';
    countdownVal = 3;
    playSound('beep');
    
    countdownIntervalId = setInterval(() => {
      countdownVal--;
      if (countdownVal > 0) {
        playSound('beep');
      } else if (countdownVal === 0) {
        playSound('start');
      } else {
        clearInterval(countdownIntervalId);
        startGameplay();
      }
    }, 1000);
  };

  const startGameplay = () => {
    gameState = 'playing';
    balloons = [];
    spawnedInWave = 0;
    
    // Wave configs: Wave 1 has 10 balloons. Spawns faster and more in later waves.
    totalInWave = 8 + wave * 4;
    const spawnDelay = Math.max(350, 1600 - wave * 130);

    // Start background music loop
    startBackgroundMusic();

    // Initial trigger
    spawnBalloon();

    // Spawn loop
    spawnIntervalId = setInterval(() => {
      if (spawnedInWave < totalInWave) {
        spawnBalloon();
      } else {
        clearInterval(spawnIntervalId);
        spawnIntervalId = null;
      }
    }, spawnDelay);
  };

  const spawnBalloon = () => {
    if (gameState !== 'playing') return;

    // Pick random balloon category
    // Standard normal (70%), fast (15%), bonus score (10%), bomb obstacle (5%)
    let rand = Math.random() * 100;
    let type: Balloon['type'] = 'normal';
    let size = Math.floor(Math.random() * 20) + 70; // 70px to 90px
    let color = '';
    let points = 100;

    // Wave 2+ introduces Obsidian Bombs to keep it challenging
    const bombThreshold = wave >= 2 ? 8 : 0;
    const bonusThreshold = bombThreshold + 12;
    const fastThreshold = bonusThreshold + 15;

    if (rand < bombThreshold) {
      type = 'bomb';
      color = 'purple';
      size = 65; // Smaller and trickier
      points = -300;
    } else if (rand < bonusThreshold) {
      type = 'bonus';
      color = 'yellow'; // Gold shiny
      size = 85;
      points = 400;
    } else if (rand < fastThreshold) {
      type = 'fast';
      color = 'blue'; // Electric cyan
      size = 60; // Tiny speedster
      points = 200;
    } else {
      // Normal balloon options (Red, Green, Pink, Orange)
      type = 'normal';
      const normalColors = ['red', 'green', 'pink', 'orange'];
      color = normalColors[Math.floor(Math.random() * normalColors.length)];
      points = 100;
    }

    // Set flying velocity. Base duration decreases with wave number.
    const baseMinSpeed = Math.max(2.2, 5.0 - wave * 0.4);
    const baseMaxSpeed = Math.max(3.8, 8.0 - wave * 0.6);
    let speed = Math.random() * (baseMaxSpeed - baseMinSpeed) + baseMinSpeed;

    // Speed modifiers based on type
    if (type === 'fast') speed *= 0.65; // Moves 35% faster
    if (type === 'bonus') speed *= 0.85; // Moves 15% faster
    if (type === 'bomb') speed *= 0.9;   // Moves 10% faster

    const balloon: Balloon = {
      id: balloonIdCounter++,
      x: Math.random() * 82 + 8, // Between 8% and 90% left
      size,
      speed,
      color,
      type,
      points,
      popped: false
    };

    balloons.push(balloon);
    spawnedInWave++;
  };

  const handlePop = (balloon: Balloon, event: MouseEvent) => {
    if (balloon.popped || gameState !== 'playing') return;

    balloon.popped = true;

    // Trigger explosive audio context pop synth
    if (balloon.type === 'bomb') {
      playSound('bomb');
      triggerScreenFlash();
      lives--;
      score = Math.max(0, score + balloon.points);
    } else {
      playSound('pop');
      score += balloon.points;
    }

    // Spawn rich debris popping confetti
    spawnConfetti(event.clientX, event.clientY, balloon.color);

    // If lives reach zero from popping a bomb
    if (lives <= 0) {
      triggerGameOver();
      return;
    }

    checkWaveCompletion();
  };

  // Trigger escape logic when a balloon exits the top of viewport naturally
  const handleEscape = (balloonId: number) => {
    const targetIdx = balloons.findIndex(b => b.id === balloonId);
    if (targetIdx === -1) return;

    const balloon = balloons[targetIdx];

    if (!balloon.popped && gameState === 'playing') {
      // Bomb escaping has no negative effect (player successfully avoided it!)
      if (balloon.type !== 'bomb') {
        playSound('escape');
        triggerScreenFlash();
        lives--;
      }

      // Check for death
      if (lives <= 0) {
        triggerGameOver();
        // Remove from screen immediately
        balloons.splice(targetIdx, 1);
        return;
      }
    }

    // Clean up balloon from state
    balloons.splice(targetIdx, 1);
    checkWaveCompletion();
  };

  const triggerScreenFlash = () => {
    screenFlash = true;
    setTimeout(() => {
      screenFlash = false;
    }, 200);
  };

  const checkWaveCompletion = () => {
    // Wave completes if:
    // 1. We have fully spawned all balloons for the wave
    // 2. There are zero unpopped balloons remaining in our state
    if (spawnedInWave >= totalInWave && activeBalloonsCount === 0 && gameState === 'playing') {
      triggerWaveTransition();
    }
  };

  const triggerWaveTransition = () => {
    clearTimers();
    gameState = 'wave_transition';
    playSound('wave_clear');

    setTimeout(() => {
      wave++;
      startGameplay();
    }, 2500);
  };

  const triggerGameOver = () => {
    clearTimers();
    gameState = 'gameover';
    playSound('gameover');
    
    saveHighScore();
  };

  const saveHighScore = async () => {
    try {
      // 1. First save score locally in localStorage
      const stored = localStorage.getItem('balloonHighscores');
      let scoresList: Array<{ name: string; score: number; wave: number; date: string }> = [];

      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          scoresList = parsed;
        } else if (typeof parsed === 'object') {
          // Compatibility map
          scoresList = Object.entries(parsed).map(([name, sc]) => ({
            name,
            score: sc as number,
            wave: 1,
            date: new Date().toLocaleDateString()
          }));
        }
      }

      // Add the new record locally
      const newRecord = {
        name: username,
        score: score,
        wave: wave,
        date: new Date().toLocaleDateString()
      };

      scoresList.push(newRecord);
      scoresList.sort((a, b) => b.score - a.score);
      scoresList = scoresList.slice(0, 10);
      localStorage.setItem('balloonHighscores', JSON.stringify(scoresList));

      // 2. Insert or update record in Supabase public.highscores table
      if (score > 0) {
        // Retrieve persistent unique player_id from localStorage
        let playerId = localStorage.getItem('balloonPlayerId');
        if (!playerId) {
          playerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).substring(2, 15) + Math.random().toString(36).substring(2, 15);
          localStorage.setItem('balloonPlayerId', playerId);
        }

        // Check if an entry already exists for this player_id
        const { data: existingEntry, error: fetchEntryError } = await supabase
          .from('highscores')
          .select('id, username, score, wave')
          .eq('player_id', playerId)
          .maybeSingle();

        if (fetchEntryError) {
          console.error('Supabase error fetching existing score for player:', fetchEntryError.message);
        }

        if (existingEntry) {
          // Record exists for this player!
          const newScoreIsHigher = score > existingEntry.score;
          
          if (newScoreIsHigher) {
            // Update everything: username, score, wave
            const { error: updateError } = await supabase
              .from('highscores')
              .update({
                username: username,
                score: score,
                wave: wave
              })
              .eq('player_id', playerId);

            if (updateError) {
              console.error('Supabase error updating highscore:', updateError.message);
            }
          } else if (username !== existingEntry.username) {
            // Name changed, but score is not higher. Just update the username!
            const { error: updateError } = await supabase
              .from('highscores')
              .update({
                username: username
              })
              .eq('player_id', playerId);

            if (updateError) {
              console.error('Supabase error updating username:', updateError.message);
            }
          }
        } else {
          // No record exists for this player yet. Insert a new one!
          const { error: insertError } = await supabase
            .from('highscores')
            .insert({
              player_id: playerId,
              username: username,
              score: score,
              wave: wave
            });

          if (insertError) {
            console.error('Supabase error inserting new player score:', insertError.message);
          }
        }
      }

      // 3. Fetch top global scores from Supabase
      const { data: dbScores, error: fetchError } = await supabase
        .from('highscores')
        .select('username, score, wave, created_at')
        .order('score', { ascending: false })
        .limit(5);

      if (fetchError) {
        console.error('Supabase error fetching highscores:', fetchError.message);
        // Fallback to local leaderboard if query fails
        leaderboard = scoresList.slice(0, 5);
      } else if (dbScores && dbScores.length > 0) {
        // Map db records to scoreboard items
        leaderboard = dbScores.map(item => ({
          name: item.username,
          score: item.score,
          wave: item.wave,
          date: new Date(item.created_at).toLocaleDateString()
        }));

        // Check if the current user's score achieved a top global highscore
        const maxGlobalScore = Math.max(...dbScores.map(s => s.score), 0);
        isNewHighScore = score >= maxGlobalScore && score > 0;
      } else {
        // Fallback to local
        leaderboard = scoresList.slice(0, 5);
        const maxLocal = scoresList.length > 1 ? Math.max(...scoresList.slice(1).map(s => s.score), 0) : 0;
        isNewHighScore = score > maxLocal && score > 0;
      }
    } catch (e) {
      console.error('Error saving highscore:', e);
      // Fallback
      leaderboard = scoresList.slice(0, 5);
      isNewHighScore = score > 0;
    }
  };

  // Generate pop particle splash
  const spawnConfetti = (x: number, y: number, colorName: string) => {
    const particleColors: Record<string, string[]> = {
      red: ['#f87171', '#ef4444', '#b91c1c', '#fee2e2'],
      blue: ['#22d3ee', '#06b6d4', '#0891b2', '#cffafe'],
      yellow: ['#fbbf24', '#f59e0b', '#d97706', '#fef3c7'],
      pink: ['#f472b6', '#ec4899', '#db2777', '#fce7f3'],
      orange: ['#fb923c', '#f97316', '#ea580c', '#ffedd5'],
      green: ['#4ade80', '#22c55e', '#16a34a', '#dcfce7'],
      purple: ['#c084fc', '#a855f7', '#7e22ce', '#f3e8ff']
    };

    const colors = particleColors[colorName] || ['#fff', '#ccc', '#999'];
    const count = 14;

    for (let i = 0; i < count; i++) {
      const angle = (i / count) * Math.PI * 2 + (Math.random() - 0.5) * 0.5;
      const velocity = Math.random() * 120 + 80; // Distance to push
      
      const particle: Particle = {
        id: particleIdCounter++,
        x,
        y,
        tx: Math.cos(angle) * velocity,
        ty: Math.sin(angle) * velocity + Math.random() * 40, // add a bit of gravity drift
        color: colors[Math.floor(Math.random() * colors.length)],
        size: Math.random() * 6 + 4 // 4px to 10px
      };

      particles.push(particle);
    }

    // Clean particles from DOM after their animation completes (600ms)
    setTimeout(() => {
      // Retain only particles that belong to newer pops to prevent leak
      particles = particles.slice(count);
    }, 650);
  };

  const restartGame = () => {
    clearTimers();
    score = 0;
    wave = 1;
    lives = 3;
    balloons = [];
    particles = [];
    isNewHighScore = false;
    startCountdown();
  };

  const quitGame = () => {
    clearTimers();
    goto(`${base}/`);
  };

  const toggleSound = () => {
    isMuted = !isMuted;
    localStorage.setItem('balloonAudioEnabled', String(!isMuted));
    playSound('beep');
  };
</script>

<div class="game-container min-h-screen relative overflow-hidden bg-slate-950 text-slate-100 font-sans select-none flex flex-col justify-between">
  
  <!-- Red Border Damage Overlay on Life Loss -->
  {#if screenFlash}
    <div class="absolute inset-0 border-[6px] md:border-[12px] border-red-500/40 bg-red-600/10 pointer-events-none z-40 animate-pulse duration-100"></div>
  {/if}

  <!-- HUD: Heads-up Display -->
  <header class="w-full flex items-center justify-between p-4 md:p-6 z-30 bg-gradient-to-b from-slate-950 via-slate-950/80 to-transparent backdrop-blur-[2px]">
    
    <!-- Player, Wave, Menu details -->
    <div class="flex items-center gap-2.5">
      <!-- Quit / Main Menu Button -->
      <button 
        onclick={quitGame}
        class="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-red-500/30 hover:bg-red-500/5 transition-all text-slate-400 hover:text-red-400 cursor-pointer shadow-md flex items-center justify-center gap-1.5 z-50"
        title="Zurück zum Hauptmenü"
        aria-label="Back to Main Menu"
      >
        <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
        </svg>
        <span class="hidden lg:inline text-xs font-extrabold tracking-wider">MENÜ</span>
      </button>

      <div class="px-3 py-1.5 rounded-xl bg-slate-900 border border-slate-800 shadow-lg flex items-center gap-2">
        <svg class="w-4 h-4 text-violet-400" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
        </svg>
        <span class="text-xs font-bold text-slate-300 truncate max-w-[60px] sm:max-w-[80px] md:max-w-[120px]">{username}</span>
      </div>

      <div class="px-3.5 py-1.5 rounded-xl bg-gradient-to-r from-violet-600 to-pink-600 border border-violet-400/20 shadow-lg text-xs font-extrabold tracking-wider uppercase">
        WAVE {wave}
      </div>
    </div>

    <!-- Glowing Score Board -->
    <div class="flex flex-col items-center">
      <span class="text-[10px] font-extrabold uppercase tracking-widest text-slate-500">SCORE</span>
      <span class="text-3xl md:text-4xl font-black tracking-widest text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 font-extrabold drop-shadow-[0_0_10px_rgba(236,72,153,0.3)]">
        {score.toLocaleString()}
      </span>
    </div>

    <!-- Health / Sound / Pause settings -->
    <div class="flex items-center gap-2.5 sm:gap-4">
      
      <!-- Audio Toggle Button -->
      <button 
        onclick={toggleSound}
        class="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-slate-700 transition-all text-slate-400 hover:text-slate-100 cursor-pointer shadow-md"
        aria-label="Toggle audio"
      >
        {#if !isMuted}
          <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
          </svg>
        {:else}
          <svg class="w-4 h-4 text-slate-500" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
            <line x1="23" y1="9" x2="17" y2="15"></line>
            <line x1="17" y1="9" x2="23" y2="15"></line>
          </svg>
        {/if}
      </button>

      <!-- Pause / Resume Button -->
      {#if gameState === 'playing' || gameState === 'paused'}
        <button 
          onclick={gameState === 'paused' ? resumeGame : pauseGame}
          class="p-2 rounded-xl bg-slate-900 border border-slate-800 hover:border-violet-500/30 hover:bg-violet-500/5 transition-all text-slate-400 hover:text-violet-400 cursor-pointer shadow-md flex items-center justify-center gap-1.5 z-50"
          title={gameState === 'paused' ? 'Spiel fortsetzen' : 'Spiel pausieren'}
          aria-label="Pause game"
        >
          {#if gameState === 'paused'}
            <!-- Play icon -->
            <svg class="w-4 h-4 text-green-400 animate-pulse" fill="currentColor" viewBox="0 0 24 24">
              <path d="M8 5v14l11-7z" />
            </svg>
            <span class="text-xs font-extrabold tracking-wider text-green-400">PLAY</span>
          {:else}
            <!-- Pause icon -->
            <svg class="w-4 h-4 text-amber-400" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
            <span class="text-xs font-extrabold tracking-wider text-amber-400">PAUSE</span>
          {/if}
        </button>
      {/if}

      <!-- Life Hearts -->
      <div class="flex items-center gap-1.5 bg-slate-900 border border-slate-800 p-2 rounded-xl shadow-lg">
        {#each Array(3) as _, i}
          <svg 
            class="w-6 h-6 transition-all duration-300 
                   {i < lives ? 'text-red-500 filter drop-shadow-[0_0_4px_rgba(239,68,68,0.5)] scale-100 animate-pulse' : 'text-slate-700 scale-90 opacity-40'}" 
            fill={i < lives ? 'currentColor' : 'none'} 
            stroke="currentColor" 
            stroke-width="2" 
            viewBox="0 0 24 24"
          >
            <path stroke-linecap="round" stroke-linejoin="round" d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z" />
          </svg>
        {/each}
      </div>

    </div>
  </header>

  <!-- Gameplay Active Field -->
  <div class="w-full flex-grow relative overflow-hidden z-10" id="gameplay-area">
    
    <!-- Active flying balloons -->
    {#each balloons as balloon (balloon.id)}
      <button 
        type="button"
        onclick={(e) => handlePop(balloon, e)}
        onanimationend={() => handleEscape(balloon.id)}
        class="absolute balloon-btn cursor-pointer {balloon.popped ? 'popped' : ''} {gameState === 'paused' ? 'paused' : ''} {balloon.type}"
        style="
          left: {balloon.x}%; 
          --size: {balloon.size}px; 
          --duration: {balloon.speed}s;
          --color-raw: {balloon.color};
        "
        aria-label="Balloon button"
      >
        <!-- Balloon Body -->
        <div class="balloon-body">
          <!-- Glossy highlight gloss -->
          <div class="balloon-gloss"></div>
          
          {#if balloon.type === 'bomb'}
            <!-- Hazard spikes and warning pattern inside bomb -->
            <div class="bomb-hazard-icon flex items-center justify-center">
              <svg class="w-7 h-7 text-red-500 animate-spin" style="animation-duration: 4s" fill="currentColor" viewBox="0 0 20 20">
                <path fill-rule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 5zm0 9a1 1 0 100-2 1 1 0 000 2z" clip-rule="evenodd" />
              </svg>
            </div>
          {:else if balloon.type === 'bonus'}
            <!-- Golden star inside high points balloon -->
            <div class="bomb-hazard-icon flex items-center justify-center">
              <svg class="w-7 h-7 text-amber-300 animate-pulse" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
            </div>
          {/if}
        </div>
        
        <!-- Tie knot at bottom -->
        <div class="balloon-knot"></div>
        
        <!-- String hanging -->
        <div class="balloon-string"></div>
      </button>
    {/each}

    <!-- POP Confetti Particles -->
    {#each particles as pt (pt.id)}
      <div 
        class="absolute pop-particle pointer-events-none {gameState === 'paused' ? 'paused' : ''}"
        style="
          left: {pt.x}px; 
          top: {pt.y}px;
          --tx: {pt.tx}px;
          --ty: {pt.ty}px;
          --bg-color: {pt.color};
          width: {pt.size}px;
          height: {pt.size}px;
        "
      ></div>
    {/each}

    <!-- Pre-game Countdown Overlay -->
    {#if gameState === 'countdown'}
      <div class="absolute inset-0 flex flex-col justify-center items-center bg-slate-950/80 backdrop-blur-md z-40 transition-all duration-300">
        <span class="text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">Game starting in...</span>
        <div class="relative flex items-center justify-center">
          <div class="absolute w-48 h-48 bg-violet-600/10 rounded-full filter blur-2xl animate-pulse"></div>
          <span class="text-8xl font-black text-transparent bg-clip-text bg-gradient-to-b from-slate-100 to-slate-400 font-extrabold animate-countdown shadow-sm">
            {countdownVal > 0 ? countdownVal : 'POP!'}
          </span>
        </div>
        <span class="text-xs font-bold uppercase tracking-wider text-violet-400 mt-6 animate-pulse">Ready Your Finger/Cursor!</span>
      </div>
    {/if}

    <!-- Wave Cleared Transition Banner -->
    {#if gameState === 'wave_transition'}
      <div class="absolute inset-0 flex flex-col justify-center items-center bg-slate-950/70 backdrop-blur-[2px] z-40 animate-fade-in">
        <div class="px-8 py-6 rounded-3xl bg-slate-900/90 border border-slate-800 shadow-2xl flex flex-col items-center gap-3 relative overflow-hidden text-center max-w-sm w-full mx-4">
          <div class="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-emerald-500 to-transparent"></div>
          <div class="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-400 border border-emerald-500/20 shadow-inner">
            <svg class="w-6 h-6" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4.5 12.75l6 6 9-13.5" />
            </svg>
          </div>
          <h2 class="text-2xl font-black uppercase tracking-wider text-emerald-400 mt-2">
            WAVE {wave} CLEAR!
          </h2>
          <p class="text-xs font-bold tracking-widest text-slate-500 uppercase">
            Preparing next wave...
          </p>
          <div class="mt-4 px-4 py-1.5 rounded-xl bg-slate-950/80 border border-slate-800 text-xs font-bold text-slate-400">
            Speed is increasing!
          </div>
        </div>
      </div>
    {/if}

    <!-- BEAUTIFUL GLOWING RETRO PAUSE OVERLAY -->
    {#if gameState === 'paused'}
      <div class="absolute inset-0 flex justify-center items-center p-4 bg-slate-950/80 backdrop-blur-md z-40">
        <div class="w-full max-w-sm bg-slate-900/90 border border-slate-800/80 rounded-3xl p-6 shadow-2xl flex flex-col gap-5 items-center text-center relative overflow-hidden animate-fade-in">
          
          <div class="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-amber-500 to-violet-500"></div>

          <div class="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 mb-1 shadow-inner animate-pulse">
            <svg class="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          </div>

          <div>
            <h2 class="text-3xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-amber-400 to-violet-400 font-extrabold">
              PAUSE
            </h2>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Nimm einen Schluck Wasser!</p>
          </div>

          <button 
            onclick={resumeGame}
            class="w-full relative group cursor-pointer mt-2"
          >
            <div class="absolute -inset-1 bg-gradient-to-r from-green-500 to-emerald-500 rounded-xl blur opacity-75 group-hover:opacity-100 transition duration-300"></div>
            <div class="relative w-full py-3.5 bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-500 hover:to-emerald-500 text-white font-extrabold text-sm rounded-xl transition duration-300 shadow-md tracking-wider flex items-center justify-center gap-1.5 border border-green-400/20">
              <svg class="w-4.5 h-4.5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M8 5v14l11-7z" />
              </svg>
              <span>WEITERSPIELEN</span>
            </div>
          </button>

          <button 
            onclick={quitGame}
            class="w-full py-3 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-400 hover:text-white font-extrabold text-xs rounded-xl transition duration-300 cursor-pointer shadow-md tracking-wider flex items-center justify-center gap-1.5"
          >
            <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
            </svg>
            <span>HAUPTMENÜ</span>
          </button>

        </div>
      </div>
    {/if}

    <!-- GAME OVER SCREEN OVERLAY -->
    {#if gameState === 'gameover'}
      <div class="absolute inset-0 flex justify-center items-center p-4 bg-slate-950/90 backdrop-blur-xl z-50 overflow-y-auto">
        <div class="w-full max-w-md bg-slate-900 border border-slate-800/80 rounded-3xl p-6 md:p-8 shadow-2xl flex flex-col gap-6 relative animate-game-over overflow-hidden">
          
          <div class="absolute top-0 left-0 w-full h-[3px] bg-gradient-to-r from-red-600 to-pink-600"></div>

          <!-- Header Title -->
          <div class="text-center flex flex-col items-center">
            <div class="w-14 h-14 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-500 mb-3 shadow-inner">
              <svg class="w-7 h-7" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            
            <h2 class="text-3xl font-black uppercase tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-red-500 to-pink-500 font-extrabold drop-shadow-md">
              GAME OVER
            </h2>
            <p class="text-xs font-bold text-slate-500 uppercase tracking-widest mt-1">Better luck next time!</p>
          </div>

          <!-- Stats Block -->
          <div class="grid grid-cols-2 gap-4">
            <div class="bg-slate-950/70 border border-slate-800/60 rounded-2xl p-4 flex flex-col items-center text-center shadow-inner relative overflow-hidden">
              {#if isNewHighScore}
                <div class="absolute -top-1 -right-1 bg-amber-500 text-slate-950 font-black text-[8px] uppercase px-2 py-0.5 rounded-bl-lg shadow-sm">NEW</div>
              {/if}
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">FINAL SCORE</span>
              <span class="text-2xl font-black mt-1 text-slate-100 {isNewHighScore ? 'text-amber-400 font-extrabold drop-shadow-[0_0_8px_rgba(245,158,11,0.2)]' : ''}">
                {score.toLocaleString()}
              </span>
            </div>
            <div class="bg-slate-950/70 border border-slate-800/60 rounded-2xl p-4 flex flex-col items-center text-center shadow-inner">
              <span class="text-[10px] font-bold text-slate-500 uppercase tracking-widest">MAX WAVE</span>
              <span class="text-2xl font-black mt-1 text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-pink-400 font-extrabold">
                {wave}
              </span>
            </div>
          </div>

          <!-- Game Over Leaderboard -->
          <div class="flex flex-col gap-2.5">
            <div class="flex items-center gap-2 border-b border-slate-800 pb-2">
              <svg class="w-4.5 h-4.5 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
              </svg>
              <h3 class="text-xs font-bold uppercase tracking-wider text-slate-400">
                LEADERBOARD
              </h3>
            </div>

            {#if leaderboard.length > 0}
              <div class="flex flex-col gap-2">
                {#each leaderboard as entry, idx}
                  <div class="flex items-center justify-between py-2 px-3 rounded-xl text-xs {entry.name === username && entry.score === score ? 'bg-violet-500/10 border border-violet-500/20' : 'bg-transparent'}">
                    <div class="flex items-center gap-2">
                      <span class="w-5 h-5 rounded-full flex items-center justify-center font-extrabold text-[10px]
                        {idx === 0 ? 'bg-amber-400 text-slate-950' : 
                         idx === 1 ? 'bg-slate-300 text-slate-950' : 
                         idx === 2 ? 'bg-amber-600 text-slate-100' : 
                         'bg-slate-800 text-slate-400'}"
                      >
                        {idx + 1}
                      </span>
                      <span class="font-bold {entry.name === username && entry.score === score ? 'text-violet-400' : 'text-slate-300'} truncate max-w-[120px]">
                        {entry.name}
                      </span>
                    </div>
                    <div class="flex items-center gap-3">
                      <span class="text-[10px] font-semibold text-slate-600">Wave {entry.wave || 1}</span>
                      <span class="font-black text-right min-w-[50px] tracking-wide text-slate-200">
                        {entry.score.toLocaleString()}
                      </span>
                    </div>
                  </div>
                {/each}
              </div>
            {/if}
          </div>

          <!-- Buttons -->
          <div class="flex flex-col sm:flex-row gap-3 mt-2">
            <button 
              onclick={restartGame}
              class="flex-1 relative group cursor-pointer"
            >
              <div class="absolute -inset-1 bg-gradient-to-r from-violet-600 to-pink-600 rounded-xl blur opacity-70 group-hover:opacity-100 transition duration-300"></div>
              <div class="relative w-full py-3.5 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-extrabold text-sm rounded-xl transition duration-300 shadow-md tracking-wider flex items-center justify-center gap-1.5 border border-violet-400/20">
                <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
                </svg>
                <span>PLAY AGAIN</span>
              </div>
            </button>

            <button 
              onclick={quitGame}
              class="flex-1 py-3.5 bg-slate-950 hover:bg-slate-800 border border-slate-800 hover:border-slate-700 text-slate-300 hover:text-white font-extrabold text-sm rounded-xl transition duration-300 cursor-pointer shadow-md tracking-wider flex items-center justify-center gap-1.5"
            >
              <svg class="w-4 h-4" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15M12 9l-3 3m0 0l3 3m-3-3h12.75" />
              </svg>
              <span>MAIN MENU</span>
            </button>
          </div>

        </div>
      </div>
    {/if}

  </div>

  <!-- Instruction bar -->
  <footer class="w-full text-center py-3 text-[10px] font-bold tracking-widest text-slate-600 uppercase border-t border-slate-900/50 bg-slate-950 z-20">
    <span class="text-red-400">RED: 100 PTS</span> &bull; 
    <span class="text-cyan-400">BLUE: 200 PTS</span> &bull; 
    <span class="text-yellow-400">GOLD: 400 PTS</span> &bull; 
    <span class="text-purple-400">BOMB: -300 PTS &amp; -1 LIFE</span>
  </footer>

</div>

<style>
  /* Game Area Container */
  .game-container {
    background: radial-gradient(circle at 50% 50%, hsl(220, 20%, 8%), hsl(220, 25%, 3%));
  }

  /* Grid lines overlay for depth */
  .game-container::before {
    content: '';
    position: absolute;
    inset: 0;
    background-image: 
      linear-gradient(rgba(255, 255, 255, 0.005) 1px, transparent 1px),
      linear-gradient(90deg, rgba(255, 255, 255, 0.005) 1px, transparent 1px);
    background-size: 40px 40px;
    background-position: center;
    pointer-events: none;
    z-index: 1;
  }

  /* Balloon Button core styling */
  .balloon-btn {
    bottom: -150px; /* Start below the visible screen */
    width: var(--size);
    height: calc(var(--size) * 1.25);
    display: flex;
    flex-direction: column;
    align-items: center;
    border: none;
    background: transparent;
    padding: 0;
    outline: none;
    z-index: 10;
    transform-origin: bottom center;
    animation: rise var(--duration) linear forwards;
  }

  /* Balloon body 3D glossy bulb shape */
  .balloon-body {
    position: relative;
    width: 100%;
    height: 80%;
    border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;
    box-shadow: 
      inset -10px -10px 25px rgba(0,0,0,0.5), 
      inset 8px 8px 25px rgba(255,255,255,0.3),
      0 10px 25px rgba(0,0,0,0.4);
    transition: transform 0.2s cubic-bezier(0.175, 0.885, 0.32, 1.275);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Shiny high-fidelity reflection reflection */
  .balloon-gloss {
    position: absolute;
    top: 12%;
    left: 15%;
    width: 25%;
    height: 25%;
    background: rgba(255, 255, 255, 0.45);
    border-radius: 50%;
    filter: blur(0.5px);
  }

  /* Balloon colors using raw variables mapped to exact rich HSL gradients */
  .balloon-btn[style*="--color-raw: red"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(0, 90%, 65%) 0%, hsl(0, 95%, 45%) 60%, hsl(0, 100%, 25%) 100%);
    box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.4), 0 8px 20px rgba(239, 68, 68, 0.25);
  }
  .balloon-btn[style*="--color-raw: red"] .balloon-knot { border-bottom-color: hsl(0, 95%, 35%); }

  .balloon-btn[style*="--color-raw: blue"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(195, 90%, 65%) 0%, hsl(195, 95%, 45%) 60%, hsl(195, 100%, 25%) 100%);
    box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.4), 0 8px 20px rgba(6, 182, 212, 0.25);
  }
  .balloon-btn[style*="--color-raw: blue"] .balloon-knot { border-bottom-color: hsl(195, 95%, 35%); }

  .balloon-btn[style*="--color-raw: green"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(130, 80%, 60%) 0%, hsl(130, 85%, 42%) 60%, hsl(130, 90%, 22%) 100%);
    box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.4), 0 8px 20px rgba(34, 197, 94, 0.25);
  }
  .balloon-btn[style*="--color-raw: green"] .balloon-knot { border-bottom-color: hsl(130, 85%, 32%); }

  .balloon-btn[style*="--color-raw: pink"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(330, 90%, 70%) 0%, hsl(330, 90%, 50%) 60%, hsl(330, 95%, 30%) 100%);
    box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.4), 0 8px 20px rgba(236, 72, 153, 0.25);
  }
  .balloon-btn[style*="--color-raw: pink"] .balloon-knot { border-bottom-color: hsl(330, 90%, 40%); }

  .balloon-btn[style*="--color-raw: orange"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(25, 95%, 65%) 0%, hsl(25, 95%, 48%) 60%, hsl(25, 100%, 28%) 100%);
    box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.4), 0 8px 20px rgba(249, 115, 22, 0.25);
  }
  .balloon-btn[style*="--color-raw: orange"] .balloon-knot { border-bottom-color: hsl(25, 95%, 38%); }

  /* Premium Golden Balloon with animated neon shadow */
  .balloon-btn[style*="--color-raw: yellow"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(48, 95%, 70%) 0%, hsl(48, 95%, 50%) 60%, hsl(40, 100%, 30%) 100%);
    box-shadow: 
      inset -10px -10px 25px rgba(0,0,0,0.6), 
      inset 8px 8px 20px rgba(255,255,255,0.5), 
      0 0 20px rgba(245, 158, 11, 0.5),
      0 10px 25px rgba(245, 158, 11, 0.25);
    animation: goldGlow 1.5s infinite alternate ease-in-out;
  }
  .balloon-btn[style*="--color-raw: yellow"] .balloon-knot { border-bottom-color: hsl(48, 95%, 38%); }

  /* Spooky dark purple OBSIDIAN bomb */
  .balloon-btn[style*="--color-raw: purple"] .balloon-body {
    background: radial-gradient(circle at 35% 35%, hsl(270, 40%, 45%) 0%, hsl(275, 75%, 20%) 60%, hsl(280, 100%, 5%) 100%);
    box-shadow: 
      inset -8px -8px 20px rgba(0,0,0,0.8), 
      inset 6px 6px 15px rgba(255,255,255,0.15), 
      0 0 15px rgba(168, 85, 247, 0.3);
    border: 1px solid rgba(168, 85, 247, 0.2);
  }
  .balloon-btn[style*="--color-raw: purple"] .balloon-knot { border-bottom-color: hsl(270, 75%, 15%); }

  /* Balloon Bottom Knot */
  .balloon-knot {
    width: 0;
    height: 0;
    border-left: 8px solid transparent;
    border-right: 8px solid transparent;
    border-bottom: 10px solid #555;
    margin-top: -1px;
    z-index: 5;
  }

  /* Thin hanging balloon string */
  .balloon-string {
    width: 2px;
    height: 80px;
    background: rgba(255, 255, 255, 0.15);
    transform-origin: top center;
    animation: sway 2s infinite ease-in-out;
  }

  /* Pop animation state */
  .balloon-btn.popped,
  .balloon-btn.paused {
    animation-play-state: paused !important;
    pointer-events: none;
  }

  .balloon-btn.popped .balloon-body {
    transform: scale(1.4);
    opacity: 0;
    filter: blur(10px);
    transition: transform 0.12s ease-out, opacity 0.12s ease-out, filter 0.12s ease-out;
  }

  .balloon-btn.popped .balloon-knot,
  .balloon-btn.popped .balloon-string {
    opacity: 0;
    transition: opacity 0.05s ease-out;
  }

  /* POPOVER PARTICLES */
  .pop-particle {
    border-radius: 50%;
    background-color: var(--bg-color);
    box-shadow: 0 0 6px var(--bg-color);
    animation: explode 0.6s cubic-bezier(0.1, 0.8, 0.3, 1) forwards;
  }

  .pop-particle.paused {
    animation-play-state: paused !important;
  }

  /* KEYFRAMES ANIMATIONS */
  @keyframes rise {
    0% {
      transform: translateY(0) rotate(0deg);
    }
    50% {
      /* Add subtle wind drift */
      transform: translateY(-48vh) rotate(5deg);
    }
    100% {
      transform: translateY(-96vh) rotate(-5deg);
    }
  }

  @keyframes sway {
    0%, 100% { transform: rotate(5deg); }
    50% { transform: rotate(-5deg); }
  }

  @keyframes explode {
    0% {
      transform: translate3d(0, 0, 0) scale(1);
      opacity: 1;
    }
    80% {
      opacity: 0.8;
    }
    100% {
      transform: translate3d(var(--tx), var(--ty), 0) scale(0);
      opacity: 0;
    }
  }

  @keyframes goldGlow {
    from {
      box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.5), 0 0 15px rgba(245, 158, 11, 0.4);
    }
    to {
      box-shadow: inset -10px -10px 25px rgba(0,0,0,0.6), inset 8px 8px 20px rgba(255,255,255,0.5), 0 0 30px rgba(245, 158, 11, 0.8), 0 0 12px rgba(245, 158, 11, 0.6);
    }
  }

  /* HUD countdown scale popup animation */
  .animate-countdown {
    animation: countPop 1s ease-in-out infinite;
  }

  @keyframes countPop {
    0% {
      transform: scale(0.6);
      opacity: 0;
    }
    15% {
      transform: scale(1.1);
      opacity: 1;
    }
    50% {
      transform: scale(1);
      opacity: 1;
    }
    90% {
      transform: scale(0.9);
      opacity: 0;
    }
    100% {
      transform: scale(0.8);
      opacity: 0;
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: scale(0.95);
    }
    to {
      opacity: 1;
      transform: scale(1);
    }
  }

  /* Game over modal entry bounce */
  .animate-game-over {
    animation: gameOverEntrance 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
  }

  @keyframes gameOverEntrance {
    from {
      opacity: 0;
      transform: translateY(60px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }
</style>
