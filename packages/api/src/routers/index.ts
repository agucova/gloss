import { protectedProcedure, publicProcedure, router } from "../index";
import { curiusRouter } from "./curius";

export const appRouter = router({
	healthCheck: publicProcedure.query(() => {
		return "OK";
	}),
	privateData: protectedProcedure.query(({ ctx }) => {
		return {
			message: "This is private",
			user: ctx.session.user,
		};
	}),
	curius: curiusRouter,
});
export type AppRouter = typeof appRouter;
