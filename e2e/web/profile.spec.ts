import {
	test as authTest,
	expect as authExpect,
} from "../fixtures/authenticated-web";
import { SEED_USERS } from "../fixtures/seed-ids";

authTest.describe("Web app profile page", () => {
	authTest(
		"own profile page loads with user info and tabs",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);
			await page.goto(`/u/${SEED_USERS.agucova.username}`);

			// Wait for the page to settle
			await page.waitForLoadState("networkidle");

			// Profile header should show the user's name (h1)
			const userName = page.getByRole("heading", {
				name: SEED_USERS.agucova.name,
				level: 1,
			});
			await authExpect(userName).toBeVisible({ timeout: 10_000 });

			// Username should be shown as @agucova
			const usernameText = page.getByText(`@${SEED_USERS.agucova.username}`);
			await authExpect(usernameText).toBeVisible();

			// Stats section should show highlights, bookmarks, friends counts
			await authExpect(
				page.getByText("highlights", { exact: true })
			).toBeVisible();
			await authExpect(
				page.getByText("bookmarks", { exact: true })
			).toBeVisible();
			await authExpect(
				page.getByText("friends", { exact: true })
			).toBeVisible();

			// Own profile should have "Edit Profile" button
			const editButton = page.getByRole("button", {
				name: /edit profile/i,
			});
			await authExpect(editButton).toBeVisible();

			// Profile should show the "Highlights" tab as active
			const highlightsTab = page.getByRole("button", {
				name: /highlights/i,
			});
			await authExpect(highlightsTab).toBeVisible();
		}
	);

	authTest(
		"friend profile shows their content",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);

			// Alice is a friend of agucova
			await page.goto(`/u/${SEED_USERS.alice.username}`);
			await page.waitForLoadState("networkidle");

			// Alice's profile header should be visible (h1)
			const aliceName = page.getByRole("heading", {
				name: SEED_USERS.alice.name,
				level: 1,
			});
			await authExpect(aliceName).toBeVisible({ timeout: 10_000 });

			// Should show friendship status -- since they're already friends,
			// the button should show "Friends"
			const friendsButton = page.getByRole("button", { name: /friends/i });
			await authExpect(friendsButton).toBeVisible({ timeout: 10_000 });

			// Should show Alice's stats
			await authExpect(
				page.getByText("highlights", { exact: true })
			).toBeVisible();
			await authExpect(
				page.getByText("bookmarks", { exact: true })
			).toBeVisible();
			await authExpect(
				page.getByText("friends", { exact: true })
			).toBeVisible();

			// Should show the "Highlights" tab with content (Alice has highlights)
			const highlightsTab = page.getByRole("button", {
				name: /highlights/i,
			});
			await authExpect(highlightsTab).toBeVisible();

			// Should also show the "Bookmarks" tab (since they're friends)
			const bookmarksTab = page.getByRole("button", {
				name: /bookmarks/i,
			});
			await authExpect(bookmarksTab).toBeVisible();
		}
	);

	authTest(
		"non-friend profile shows limited content",
		async ({ authenticatedPage }) => {
			const page = await authenticatedPage(SEED_USERS.agucova.id);

			// Dan has a pending friend request to agucova (not accepted),
			// so Dan is NOT a friend. Visit Dan's profile.
			await page.goto(`/u/${SEED_USERS.dan.username}`);
			await page.waitForLoadState("networkidle");

			// Dan's profile should load (h1)
			const danName = page.getByRole("heading", {
				name: SEED_USERS.dan.name,
				level: 1,
			});
			await authExpect(danName).toBeVisible({ timeout: 10_000 });

			// Since Dan sent a request to agucova and it's pending,
			// the friendship status should show "Accept Request" (pending_received)
			const acceptButton = page.getByRole("button", {
				name: /accept request/i,
			});
			await authExpect(acceptButton).toBeVisible({ timeout: 10_000 });

			// The Highlights tab should be visible (highlights are always visible)
			const highlightsTab = page.getByRole("button", {
				name: /highlights/i,
			});
			await authExpect(highlightsTab).toBeVisible();
		}
	);
});
