<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { Track, RoomEvent } from 'livekit-client';
  import type { RemoteTrack, RemoteTrackPublication, RemoteParticipant } from 'livekit-client';
  import { sessionStore } from '$lib/stores/session';

  let localVideoEl: HTMLVideoElement;
  let remoteVideoEl: HTMLVideoElement;
  let hasRemoteVideo = $state(false);

  let unsubTrackSubscribed: (() => void) | null = null;
  let unsubTrackUnsubscribed: (() => void) | null = null;

  function attachTrackToElement(track: RemoteTrack, el: HTMLVideoElement) {
    track.attach(el);
  }

  onMount(() => {
    const room = sessionStore.getRoom();
    if (!room) return;

    // Attach local video
    const localStream = room.getLocalVideoMediaStream();
    if (localStream && localVideoEl) {
      localVideoEl.srcObject = localStream;
    }

    // Attach any existing remote video tracks
    for (const participant of room.remoteParticipants.values()) {
      for (const pub of participant.trackPublications.values()) {
        if (pub.track && pub.source === Track.Source.Camera && pub.kind === Track.Kind.Video) {
          attachTrackToElement(pub.track as RemoteTrack, remoteVideoEl);
          hasRemoteVideo = true;
        }
      }
    }

    // Listen for new remote tracks
    const nativeRoom = room.nativeRoom;

    const onTrackSubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant,
    ) => {
      if (publication.source === Track.Source.Camera && track.kind === Track.Kind.Video) {
        attachTrackToElement(track, remoteVideoEl);
        hasRemoteVideo = true;
      }
    };

    const onTrackUnsubscribed = (
      track: RemoteTrack,
      publication: RemoteTrackPublication,
      _participant: RemoteParticipant,
    ) => {
      if (publication.source === Track.Source.Camera && track.kind === Track.Kind.Video) {
        track.detach(remoteVideoEl);
        hasRemoteVideo = false;
      }
    };

    nativeRoom.on(RoomEvent.TrackSubscribed, onTrackSubscribed);
    nativeRoom.on(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);

    unsubTrackSubscribed = () => nativeRoom.off(RoomEvent.TrackSubscribed, onTrackSubscribed);
    unsubTrackUnsubscribed = () => nativeRoom.off(RoomEvent.TrackUnsubscribed, onTrackUnsubscribed);
  });

  onDestroy(() => {
    unsubTrackSubscribed?.();
    unsubTrackUnsubscribed?.();
  });
</script>

<div class="video-grid">
  <div class="video-container remote-video">
    {#if !hasRemoteVideo}
      <div class="waiting-overlay">
        <p>Waiting for other participant...</p>
      </div>
    {/if}
    <!-- svelte-ignore element_invalid_self_closing_tag -->
    <video bind:this={remoteVideoEl} autoplay playsinline />
  </div>
  <div class="video-container local-video">
    <!-- svelte-ignore element_invalid_self_closing_tag -->
    <video bind:this={localVideoEl} autoplay playsinline muted />
  </div>
</div>

<style>
  .video-grid {
    position: relative;
    width: 100%;
    height: 100%;
    background: #0d0d1a;
    border-radius: 12px;
    overflow: hidden;
  }

  .video-container video {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .remote-video {
    width: 100%;
    height: 100%;
    position: relative;
  }

  .local-video {
    position: absolute;
    bottom: 16px;
    right: 16px;
    width: 200px;
    height: 150px;
    border-radius: 8px;
    overflow: hidden;
    border: 2px solid rgba(255, 255, 255, 0.2);
    z-index: 10;
  }

  .waiting-overlay {
    position: absolute;
    inset: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: #0d0d1a;
    color: #9ca3af;
    font-size: 1.1rem;
  }
</style>
