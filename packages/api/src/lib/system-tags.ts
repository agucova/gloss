/**
 * System tags are special tags that are auto-created and protected from user modification.
 * They provide standard functionality like favorites and to-read lists.
 */
export const SYSTEM_TAGS = {
	favorites: { name: "favorites", color: "#fbbf24" }, // amber-400
	"to-read": { name: "to-read", color: "#60a5fa" }, // blue-400
} as const;

export type SystemTagName = keyof typeof SYSTEM_TAGS;

export function isSystemTagName(name: string): name is SystemTagName {
	return name in SYSTEM_TAGS;
}
