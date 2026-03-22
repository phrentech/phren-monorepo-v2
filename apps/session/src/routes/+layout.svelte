<script lang="ts">
	let { children } = $props();
</script>

<nav>
	<a href="/">Phren Session</a>
</nav>

<main>
	{@render children()}
</main>
