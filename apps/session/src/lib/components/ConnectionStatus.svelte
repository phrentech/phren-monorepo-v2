<script lang="ts">
  import { sessionStore } from '$lib/stores/session';

  let status = $derived($sessionStore.connectionStatus);
  let isVisible = $derived(status !== 'connected');

  let statusText = $derived(
    status === 'connecting'
      ? 'Connecting...'
      : status === 'reconnecting'
        ? 'Reconnecting...'
        : status === 'disconnected'
          ? 'Disconnected'
          : '',
  );

  let statusClass = $derived(
    status === 'disconnected' ? 'error' : 'warning',
  );
</script>

{#if isVisible}
  <div class="connection-status {statusClass}" role="alert">
    <span>{statusText}</span>
  </div>
{/if}

<style>
  .connection-status {
    padding: 8px 16px;
    text-align: center;
    font-size: 0.875rem;
    font-weight: 500;
    color: #fff;
  }

  .connection-status.warning {
    background: #d97706;
  }

  .connection-status.error {
    background: #dc2626;
  }
</style>
