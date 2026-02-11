import { CyberpunkActor } from "./actor.js";

export { SortModes, sortSkills }

// Stat display priority — role skills come first, then stats in rulebook order
const STAT_RANK = new Map([
    ["role", 0],
    ["int",  1], ["ref",  2], ["tech", 3],
    ["cool", 4], ["attr", 5], ["luck", 6],
    ["ma",   7], ["bt",   8], ["emp",  9],
]);

const SortModes = {
    Name: [compareByName],
    Stat: [compareByStat, compareByName]
}

export function compareByName(a, b) {
    return a.name.localeCompare(b.name);
}

export function trainedFirst(a, b) {
    const aTrained = CyberpunkActor.effectiveSkillLevel(a) > 0;
    const bTrained = CyberpunkActor.effectiveSkillLevel(b) > 0;
    return aTrained === bTrained ? 0 : aTrained ? -1 : 1;
}

function compareByStat(a, b) {
    const rankOf = skill => skill.system.isRoleSkill
        ? STAT_RANK.get("role") ?? -1
        : STAT_RANK.get(skill.system.stat) ?? -1;
    return rankOf(a) - rankOf(b);
}

// Chain multiple comparators — first non-zero result wins
function chain(comparators) {
    return (a, b) => {
        for (const cmp of comparators) {
            const result = cmp(a, b);
            if (result !== 0) return result;
        }
        return 0;
    };
}

// Sort skills with trained skills always floated to top, then by the given sort order
function sortSkills(skills, comparators) {
    if (!comparators) {
        console.warn("No sort order given. Returning original skill list");
        return skills;
    }
    return skills.slice().sort(chain([trainedFirst, ...comparators]));
}
