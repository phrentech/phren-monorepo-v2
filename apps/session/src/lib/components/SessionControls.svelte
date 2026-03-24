<script lang="ts">
  import { sessionStore } from '$lib/stores/session';

  let { userRole }: { userRole: 'patient' | 'provider' } = $props();

  let sessionState = $derived($sessionStore.state);
  let isMuted = $derived($sessionStore.isMuted);
  let isCameraOff = $derived($sessionStore.isCameraOff);

  function handleToggleMute() {
    sessionStore.toggleMute();
  }

  function handleToggleCamera() {
    sessionStore.toggleCamera();
  }

  function handleStart() {
    sessionStore.requestStateChange('active');
  }

  function handlePause() {
    sessionStore.requestStateChange('paused');
  }

  function handleResume() {
    sessionStore.requestStateChange('active');
  }

  function handleEnd() {
    sessionStore.requestStateChange('ended');
  }
</script>

<div class="session-controls">
  <div class="media-controls">
    <button
      class="control-btn"
      class:active={!isMuted}
      class:muted={isMuted}
      onclick={handleToggleMute}
      title={isMuted ? 'Unmute' : 'Mute'}
    >
      {isMuted ? 'Unmute' : 'Mute'}
    </button>

    <button
      class="control-btn"
      class:active={!isCameraOff}
      class:muted={isCameraOff}
      onclick={handleToggleCamera}
      title={isCameraOff ? 'Turn Camera On' : 'Turn Camera Off'}
    >
      {isCameraOff ? 'Camera On' : 'Camera Off'}
    </button>
  </div>

  <div class="session-actions">
    {#if userRole === 'provider' && sessionState === 'waiting'}
      <button class="control-btn start" onclick={handleStart}>Start Session</button>
    {/if}

    {#if userRole === 'provider' && sessionState === 'active'}
      <button class="control-btn pause" onclick={handlePause}>Pause</button>
    {/if}

    {#if userRole === 'provider' && sessionState === 'paused'}
      <button class="control-btn resume" onclick={handleResume}>Resume</button>
    {/if}

    {#if sessionState !== 'ended'}
      <button class="control-btn end" onclick={handleEnd}>End Session</button>
    {/if}
  </div>
</div>

<style>
  .session-controls {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 24px;
    padding: 16px;
    background: #1a1a2e;
    border-top: 1px solid rgba(255, 255, 255, 0.1);
  }

  .media-controls,
  .session-actions {
    display: flex;
    gap: 12px;
  }

  .control-btn {
    padding: 10px 20px;
    border: none;
    border-radius: 8px;
    font-size: 0.9rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.2s, opacity 0.2s;
    color: #fff;
    background: #374151;
  }

  .control-btn:hover {
    opacity: 0.85;
  }

  .control-btn.active {
    background: #374151;
  }

  .control-btn.muted {
    background: #dc2626;
  }

  .control-btn.start {
    background: #059669;
  }

  .control-btn.pause {
    background: #d97706;
  }

  .control-btn.resume {
    background: #059669;
  }

  .control-btn.end {
    background: #dc2626;
  }
</style>
