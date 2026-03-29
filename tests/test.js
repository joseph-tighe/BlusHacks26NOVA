const res = await fetch("https://translate-api.com/v1/translate", {
	method: "POST",
	body: JSON.stringify({
		"text": "Hello, world!",
        "target_languages": ["Spanish"]
	}),
	headers: { "Authorization": "Bearer ta_e8c48989eeb663bbfec26fdaade18855c3166c1069c82481788fa883b1d1c1c5", "Content-Type": "application/json" }
});

console.log(await res.json());