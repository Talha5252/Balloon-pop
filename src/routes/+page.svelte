<script lang="ts">
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';
  import { supabase } from '$lib/supabase';

  // Svelte 5 Runes for reactive state
  let username = $state('');
  let sortedScores = $state<Array<{ name: string; score: number; wave: number; date: string }>>([]);
  let audioEnabled = $state(true);
  let inputFocused = $state(false);

  // Load scores and username on mount
  onMount(() => {
    // Load username
    const storedUsername = localStorage.getItem('balloonUsername');
    if (storedUsername) {
      username = storedUsername;
    }

    // Load sound preference
    const storedAudio = localStorage.getItem('balloonAudioEnabled');
    if (storedAudio !== null) {
      audioEnabled = storedAudio === 'true';
    }

    loadScores();
  });

  const loadScores = async () => {
    try {
      // First load local scores as a fallback
      const stored = localStorage.getItem('balloonHighscores');
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          sortedScores = parsed.sort((a, b) => b.score - a.score).slice(0, 5);
        }
      }

      // Fetch global highscores from Supabase public.highscores
      const { data, error } = await supabase
        .from('highscores')
        .select('username, score, wave, created_at')
        .order('score', { ascending: false })
        .limit(5);

      if (error) {
        console.error('Supabase error loading scores:', error.message);
        return;
      }

      if (data && data.length > 0) {
        sortedScores = data.map(item => ({
          name: item.username,
          score: item.score,
          wave: item.wave,
          date: new Date(item.created_at).toLocaleDateString()
        }));
      }
    } catch (e) {
      console.error('Error loading global highscores', e);
    }
  };

  const playClickSound = () => {
    if (!audioEnabled) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      
      osc.connect(gain);
      gain.connect(ctx.destination);
      
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(150, ctx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(400, ctx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.15, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);
      
      osc.start();
      osc.stop(ctx.currentTime + 0.15);
    } catch (e) {
      // Audio context might fail to start without user interaction
    }
  };

  const toggleAudio = () => {
    audioEnabled = !audioEnabled;
    localStorage.setItem('balloonAudioEnabled', String(audioEnabled));
    playClickSound();
  };

  const startGame = () => {
    const trimmed = username.trim();
    if (trimmed) {
      playClickSound();
      localStorage.setItem('balloonUsername', trimmed);
      sessionStorage.setItem('balloonUsername', trimmed);
      // Navigate to game page
      goto('/game');
    }
  };
</script>

<!-- Ambient drift background balloons -->
<div class="background-balloons" aria-hidden="true">
  <div class="bg-balloon red" style="--left: 8%; --size: 90px; --speed: 18s; --delay: 0s;"></div>
  <div class="bg-balloon blue" style="--left: 25%; --size: 70px; --speed: 22s; --delay: -5s;"></div>
  <div class="bg-balloon yellow" style="--left: 45%; --size: 110px; --speed: 26s; --delay: -2s;"></div>
  <div class="bg-balloon green" style="--left: 65%; --size: 80px; --speed: 20s; --delay: -8s;"></div>
  <div class="bg-balloon purple" style="--left: 85%; --size: 100px; --speed: 24s; --delay: -4s;"></div>
  <div class="bg-balloon red" style="--left: 15%; --size: 75px; --speed: 25s; --delay: -12s;"></div>
  <div class="bg-balloon blue" style="--left: 75%; --size: 85px; --speed: 19s; --delay: -15s;"></div>
</div>

<main class="min-h-screen flex flex-col justify-center items-center p-4 relative overflow-hidden bg-slate-950 font-sans text-slate-100 select-none">
  
  <!-- Sound control -->
  <button 
    class="absolute top-6 right-6 p-3 rounded-full bg-slate-900/60 border border-slate-800 hover:border-violet-500 hover:bg-slate-800/80 transition-all duration-300 z-50 text-slate-400 hover:text-slate-100 cursor-pointer shadow-lg backdrop-blur-md"
    onclick={toggleAudio}
    aria-label="Toggle Sound"
  >
    {#if audioEnabled}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"></path>
      </svg>
    {:else}
      <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="text-slate-500">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"></polygon>
        <line x1="23" y1="9" x2="17" y2="15"></line>
        <line x1="17" y1="9" x2="23" y2="15"></line>
      </svg>
    {/if}
  </button>

  <div class="w-full max-w-md flex flex-col items-center gap-8 z-10">
    
    <!-- Neon glowing Game Logo -->
    <div class="text-center flex flex-col items-center animate-fade-in">
      <div class="relative group">
        <div class="absolute -inset-1 bg-gradient-to-r from-violet-600 to-pink-600 rounded-full blur-2xl opacity-60 group-hover:opacity-80 transition duration-1000 group-hover:duration-200"></div>
        <div class="relative flex items-center justify-center bg-slate-900 border border-slate-800/80 px-8 py-6 rounded-3xl shadow-2xl backdrop-blur-xl">
          <svg class="w-10 h-10 mr-3 text-pink-500 animate-bounce" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 2C8.69 2 6 4.69 6 8c0 3.31 2.69 6 6 6s6-2.69 6-6c0-3.31-2.69-6-6-6zm0 13c-1.1 0-2 .9-2 2v3c0 .55.45 1 1 1h2c.55 0 1-.45 1-1v-3c0-1.1-.9-2-2-2z" />
          </svg>
          <h1 class="text-4xl md:text-5xl font-black tracking-wider text-transparent bg-clip-text bg-gradient-to-r from-violet-400 via-pink-400 to-amber-300 font-extrabold uppercase drop-shadow-md">
            Neon Pop
          </h1>
        </div>
      </div>
      <p class="text-sm font-semibold tracking-widest text-slate-400 mt-4 uppercase animate-pulse">
        Pop 'em all, don't let 'em fall!
      </p>
    </div>

    <!-- Login card -->
    <div class="w-full bg-slate-900/60 border border-slate-800/80 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-2xl flex flex-col gap-6 relative overflow-hidden transition-all duration-300 hover:border-slate-700/80">
      
      <div class="absolute top-0 left-0 w-full h-[2px] bg-gradient-to-r from-transparent via-violet-500 to-transparent opacity-80"></div>
      
      <div class="flex flex-col gap-2">
        <label for="username" class="text-xs font-bold uppercase tracking-wider text-slate-400">
          Enter Username
        </label>
        <div class="relative flex items-center">
          <svg class="absolute left-4 w-5 h-5 transition-colors duration-300 {inputFocused ? 'text-violet-400' : 'text-slate-500'}" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          <input 
            type="text" 
            id="username"
            placeholder="SuperPopper9000..." 
            bind:value={username}
            onfocus={() => inputFocused = true}
            onblur={() => inputFocused = false}
            onkeydown={(e) => e.key === 'Enter' && startGame()}
            maxlength="16"
            class="w-full pl-12 pr-4 py-4 rounded-2xl bg-slate-950/80 border border-slate-800 hover:border-slate-700 focus:border-violet-500 focus:ring-1 focus:ring-violet-500 text-slate-100 font-medium placeholder-slate-600 outline-none transition-all duration-300 text-base"
          />
        </div>
      </div>

      <button 
        onclick={startGame}
        disabled={!username.trim()}
        class="w-full relative group cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
      >
        <div class="absolute -inset-1 bg-gradient-to-r from-violet-600 to-pink-600 rounded-2xl blur opacity-70 group-hover:opacity-100 transition duration-300 group-disabled:opacity-0"></div>
        <div class="relative w-full py-4 bg-gradient-to-r from-violet-600 to-pink-600 hover:from-violet-500 hover:to-pink-500 text-white font-extrabold text-lg rounded-2xl transition duration-300 shadow-lg tracking-wider flex items-center justify-center gap-2 group-disabled:from-slate-800 group-disabled:to-slate-800 group-disabled:text-slate-500 border border-violet-400/20 group-disabled:border-transparent">
          <span>START POPPING</span>
          <svg class="w-5 h-5 animate-pulse" fill="none" stroke="currentColor" stroke-width="3" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </div>
      </button>

    </div>

    <!-- Leaderboard -->
    <div class="w-full bg-slate-900/40 border border-slate-900/60 rounded-3xl p-6 md:p-8 backdrop-blur-xl shadow-xl flex flex-col gap-4">
      <div class="flex items-center justify-between border-b border-slate-800/80 pb-3">
        <div class="flex items-center gap-2">
          <svg class="w-5 h-5 text-amber-400" fill="currentColor" viewBox="0 0 20 20">
            <path fill-rule="evenodd" d="M11.3 1.046A1 1 0 0112 2v5h4a1 1 0 01.82 1.573l-7 10A1 1 0 018 18v-5H4a1 1 0 01-.82-1.573l7-10a1 1 0 011.12-.38z" clip-rule="evenodd" />
          </svg>
          <h2 class="text-sm font-bold uppercase tracking-wider text-slate-300">
            LEADERBOARD
          </h2>
        </div>
        <span class="text-xs font-semibold text-slate-500">TOP 5 PLAYERS</span>
      </div>

      {#if sortedScores.length > 0}
        <div class="flex flex-col gap-2">
          {#each sortedScores as entry, idx}
            <div class="flex items-center justify-between py-2.5 px-4 rounded-xl transition-colors duration-200 {idx === 0 ? 'bg-amber-500/10 border border-amber-500/20' : idx === 1 ? 'bg-slate-300/5 border border-slate-300/10' : idx === 2 ? 'bg-amber-700/5 border border-amber-700/10' : 'bg-transparent'}">
              <div class="flex items-center gap-3">
                <!-- Rank Medal/Badge -->
                <span class="w-6 h-6 rounded-full flex items-center justify-center text-xs font-black shadow-inner
                  {idx === 0 ? 'bg-amber-400 text-slate-950' : 
                   idx === 1 ? 'bg-slate-300 text-slate-950' : 
                   idx === 2 ? 'bg-amber-600 text-slate-100' : 
                   'bg-slate-800 text-slate-400'}"
                >
                  {idx + 1}
                </span>
                
                <span class="font-bold text-sm truncate max-w-[150px] {idx === 0 ? 'text-amber-300' : 'text-slate-200'}">
                  {entry.name}
                </span>
              </div>
              
              <div class="flex items-center gap-4">
                <div class="text-right">
                  <span class="text-xs text-slate-500 block font-semibold">Wave {entry.wave}</span>
                </div>
                <div class="font-black text-right text-base tracking-wide {idx === 0 ? 'text-amber-400' : idx === 1 ? 'text-slate-200' : 'text-violet-400'}">
                  {entry.score.toLocaleString()}
                </div>
              </div>
            </div>
          {/each}
        </div>
      {:else}
        <div class="flex flex-col items-center justify-center py-6 text-center text-slate-500 gap-2">
          <svg class="w-8 h-8 opacity-40 text-slate-400" fill="none" stroke="currentColor" stroke-width="1.5" viewBox="0 0 24 24">
            <path stroke-linecap="round" stroke-linejoin="round" d="M16.5 18.75h-9m9 0a3 3 0 013 3h-15a3 3 0 013-3m9 0v-3.375c0-.621-.503-1.125-1.125-1.125h-.375m1.5 4.5v-6.75M9.75 18.75v-3.375c0-.621.503-1.125 1.125-1.125h.375m-1.5 4.5v-6.75m3 9v-11.25c0-.621.503-1.125 1.125-1.125h.375m-1.5 12.375V6.375c0-.621.503-1.125 1.125-1.125h.375m-1.5 13.5v-16.5c0-.621.503-1.125 1.125-1.125h.375m-1.5 17.625V1.875c0-.621.503-1.125 1.125-1.125h.375" />
          </svg>
          <p class="text-sm font-medium">No records yet!</p>
          <p class="text-xs">Be the first to pop and claims the crown!</p>
        </div>
      {/if}
    </div>

    <!-- Instruction Footer -->
    <div class="text-center text-xs text-slate-600 font-semibold uppercase tracking-widest mt-2">
      Tap the balloons to pop them &bull; 3 Lives max
    </div>

  </div>
</main>

<style>
  /* Ambient drifting background balloons styling */
  .background-balloons {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    overflow: hidden;
    pointer-events: none;
    z-index: 0;
    opacity: 0.25;
  }

  .bg-balloon {
    position: absolute;
    bottom: -150px;
    left: var(--left);
    width: var(--size);
    height: calc(var(--size) * 1.25);
    border-radius: 50% 50% 50% 50% / 40% 40% 60% 60%;
    animation: drift var(--speed) linear infinite;
    animation-delay: var(--delay);
    box-shadow: inset -8px -8px 20px rgba(0,0,0,0.5), inset 8px 8px 20px rgba(255,255,255,0.25);
  }

  /* Tail string for bg balloons */
  .bg-balloon::after {
    content: '';
    position: absolute;
    bottom: -12px;
    left: 50%;
    width: 2px;
    height: 15px;
    background: rgba(255, 255, 255, 0.2);
    transform: translateX(-50%);
  }

  .bg-balloon::before {
    content: '';
    position: absolute;
    bottom: -4px;
    left: 50%;
    width: 0;
    height: 0;
    border-left: 5px solid transparent;
    border-right: 5px solid transparent;
    transform: translateX(-50%);
  }

  /* Balloon colors */
  .bg-balloon.red {
    background: radial-gradient(circle at 35% 35%, hsl(0, 85%, 65%), hsl(0, 85%, 35%));
  }
  .bg-balloon.red::before {
    border-bottom: 6px solid hsl(0, 85%, 45%);
  }

  .bg-balloon.blue {
    background: radial-gradient(circle at 35% 35%, hsl(200, 85%, 65%), hsl(200, 85%, 35%));
  }
  .bg-balloon.blue::before {
    border-bottom: 6px solid hsl(200, 85%, 45%);
  }

  .bg-balloon.yellow {
    background: radial-gradient(circle at 35% 35%, hsl(45, 95%, 65%), hsl(45, 95%, 35%));
  }
  .bg-balloon.yellow::before {
    border-bottom: 6px solid hsl(45, 95%, 45%);
  }

  .bg-balloon.green {
    background: radial-gradient(circle at 35% 35%, hsl(120, 75%, 60%), hsl(120, 75%, 30%));
  }
  .bg-balloon.green::before {
    border-bottom: 6px solid hsl(120, 75%, 40%);
  }

  .bg-balloon.purple {
    background: radial-gradient(circle at 35% 35%, hsl(270, 80%, 65%), hsl(270, 80%, 35%));
  }
  .bg-balloon.purple::before {
    border-bottom: 6px solid hsl(270, 80%, 45%);
  }

  @keyframes drift {
    0% {
      transform: translateY(0) rotate(0deg);
      opacity: 0;
    }
    10% {
      opacity: 0.8;
    }
    90% {
      opacity: 0.8;
    }
    100% {
      transform: translateY(-120vh) rotate(15deg);
      opacity: 0;
    }
  }

  .animate-fade-in {
    animation: fadeIn 0.8s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(20px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
</style>
