import { CuriusClient } from "./src/client";

const token =
	"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6NjM2MSwiaWF0IjoxNzY5MTM0MTA3LCJleHAiOjE4MDA1ODM3MDd9.HsRA76dx_UpSFm4dBrpHCy91UEchnqBp7GEVMRt_KZ8";

const client = new CuriusClient({ token, timeout: 30_000 });

async function test() {
	console.log("Testing Curius client with real token...\n");

	// Test 1: Get user
	console.log("1. Getting user profile...");
	try {
		const user = await client.getUser();
		console.log(
			"   ✓ User:",
			user.firstName,
			user.lastName,
			`(@${user.userLink})`
		);
	} catch (e) {
		console.log("   ✗ Error:", e);
		return;
	}

	// Test 2: Get following
	console.log("\n2. Getting following list...");
	try {
		const following = await client.getFollowing();
		console.log(`   ✓ Following ${following.length} users`);
		if (following.length > 0) {
			console.log(
				"   First 3:",
				following
					.slice(0, 3)
					.map((u) => u.firstName)
					.join(", ")
			);
		}
	} catch (e) {
		console.log("   ✗ Error:", e);
	}

	// Test 3: Get network info for a URL
	console.log("\n3. Getting network info for paulgraham.com/greatwork.html...");
	try {
		const info = await client.getNetworkInfo(
			"https://paulgraham.com/greatwork.html"
		);
		console.log(
			`   ✓ Found ${info.users.length} users who saved it, ${info.highlights.length} highlights`
		);
		for (const user of info.users.slice(0, 3)) {
			console.log(`   - ${user.firstName} ${user.lastName}`);
		}
	} catch (e) {
		console.log("   ✗ Error:", e);
	}

	// Test 4: Check if a URL is saved
	console.log("\n4. Checking if paulgraham.com/greatwork.html is saved...");
	try {
		const link = await client.getLinkByUrl(
			"https://paulgraham.com/greatwork.html"
		);
		if (link) {
			console.log(
				`   ✓ Link found: "${link.title}" with ${link.nHighlights} highlights`
			);
		} else {
			console.log("   ✓ Link not saved");
		}
	} catch (e) {
		console.log("   ✗ Error:", e);
	}

	console.log("\n✅ All tests completed!");
}

test();
