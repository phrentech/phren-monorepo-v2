<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { sessionStore } from '$lib/stores/session';
  import VideoGrid from '$lib/components/VideoGrid.svelte';
  import SessionControls from '$lib/components/SessionControls.svelte';
  import ConnectionStatus from '$lib/components/ConnectionStatus.svelte';

  let { data } = $props();

  let sessionState = $derived($sessionStore.state);
  let elapsedMs = $derived($sessionStore.elapsedMs);
  let participants = $derived($sessionStore.participants);
  let storeError = $derived($sessionStore.error);
  let error = $derived(storeError ?? data.error);

  let timerDisplay = $derived.by(() => {
    const totalSeconds = Math.floor(elapsedMs / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  });

  let stateBadgeClass = $derived(
    sessionState === 'active'
      ? 'badge-active'
      : sessionState === 'paused'
        ? 'badge-paused'
        : sessionState === 'ended'
          ? 'badge-ended'
          : 'badge-waiting',
  );

  let userRole = $derived(
    (data.user?.role === 'provider' ? 'provider' : 'patient') as 'patient' | 'provider',
  );

  onMount(async () => {
    if (data.token && data.livekitUrl && data.roomName && data.doWebSocketUrl && data.user) {
      await sessionStore.connect(
        { url: data.livekitUrl, token: data.token, roomName: data.roomName },
        data.doWebSocketUrl,
        data.user.id,
        userRole,
        data.user.name,
      );
    }
  });

  onDestroy(() => {
    sessionStore.disconnect();
  });
</script>

<div class="session-page">
  <ConnectionStatus />

  {#if error && !data.token}
    <div class="error-page">
      <h2>Unable to Join Session</h2>
      <p>{error}</p>
      <a href="/" class="back-link">Back to Home</a>
    </div>
  {:else}
    <header class="session-header">
      <div class="header-left">
        <span class="state-badge {stateBadgeClass}">{sessionState}</span>
        <span class="timer">{timerDisplay}</span>
      </div>
      <div class="header-right">
        <span class="participant-count">{participants.length} participant{participants.length !== 1 ? 's' : ''}</span>
      </div>
    </header>

    <div class="video-area">
      <VideoGrid />
    </div>

    <SessionControls {userRole} />

    {#if sessionState === 'ended'}
      <div class="ended-overlay">
        <div class="ended-content">
          <h2>Session Ended</h2>
          <p>This session has concluded.</p>
          <a href="/" class="back-link">Back to Home</a>
        </div>
      </div>
    {/if}
  {/if}
</div>

<style>
  .session-page {
    display: flex;
    flex-direction: column;
    height: 100vh;
    background: #1a1a2e;
    color: #e5e7eb;
  }

  .error-page {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    flex: 1;
    gap: 16px;
    text-align: center;
    padding: 32px;
  }

  .error-page h2 {
    color: #dc2626;
    font-size: 1.5rem;
  }

  .session-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 12px 20px;
    background: #16162a;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
  }

  .header-left,
  .header-right {
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .state-badge {
    padding: 4px 12px;
    border-radius: 999px;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .badge-waiting {
    background: #374151;
    color: #9ca3af;
  }

  .badge-active {
    background: #065f46;
    color: #6ee7b7;
  }

  .badge-paused {
    background: #78350f;
    color: #fcd34d;
  }

  .badge-ended {
    background: #7f1d1d;
    color: #fca5a5;
  }

  .timer {
    font-variant-numeric: tabular-nums;
    font-size: 1rem;
    color: #9ca3af;
  }

  .participant-count {
    font-size: 0.875rem;
    color: #9ca3af;
  }

  .video-area {
    flex: 1;
    min-height: 0;
    padding: 8px;
  }

  .ended-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.8);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 100;
  }

  .ended-content {
    text-align: center;
    padding: 40px;
    background: #1a1a2e;
    border-radius: 16px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .ended-content h2 {
    font-size: 1.5rem;
    margin-bottom: 8px;
  }

  .ended-content p {
    color: #9ca3af;
    margin-bottom: 24px;
  }

  .back-link {
    display: inline-block;
    padding: 10px 24px;
    background: #374151;
    color: #fff;
    border-radius: 8px;
    text-decoration: none;
    font-weight: 500;
    transition: background 0.2s;
  }

  .back-link:hover {
    background: #4b5563;
  }
</style>
