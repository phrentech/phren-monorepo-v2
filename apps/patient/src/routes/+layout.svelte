<script lang="ts">
	let { children } = $props();
</script>

<nav>
	<a href="/">Phren Patient</a>
</nav>

<main>
	{@render children()}
</main>
