<script lang="ts">
	let { children } = $props();
</script>

<nav>
	<a href="/">Phren Provider</a>
</nav>

<main>
	{@render children()}
</main>
