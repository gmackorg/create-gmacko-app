import { execSync } from "node:child_process";
import type { PlopTypes } from "@turbo/gen";

/**
 * The part of the generated `package.json` this generator rewrites. Every
 * other field is carried through the JSON round-trip untouched.
 */
interface GeneratedPackageJson {
  dependencies?: Record<string, string>;
}

/** The `init` prompts, decoded out of plop's untyped answers bag. */
interface InitAnswers {
  readonly name: string;
  readonly deps: readonly string[];
}

/**
 * Plop hands each action an `Answers` bag typed `{ [key: string]: any }`.
 * Both prompts are `input` prompts, so inquirer yields a string for each —
 * empty when the prompt was skipped. Decode once here and let the actions
 * work on the domain values; an empty `name` is the "nothing to scaffold"
 * case the callers branch on.
 */
function parseInitAnswers(answers: PlopTypes.Answers): InitAnswers {
  return {
    name: String(answers.name ?? "")
      .trim()
      .replace(/^@gmacko\//, ""),
    deps: String(answers.deps ?? "")
      .split(" ")
      .filter(Boolean),
  };
}

export default function generator(plop: PlopTypes.NodePlopAPI): void {
  plop.setGenerator("init", {
    description: "Generate a new package for the Acme Monorepo",
    prompts: [
      {
        type: "input",
        name: "name",
        message:
          "What is the name of the package? (You can skip the `@gmacko/` prefix)",
      },
      {
        type: "input",
        name: "deps",
        message:
          "Enter a space separated list of dependencies you would like to install",
      },
    ],
    actions: [
      (answers) => {
        // Write the decoded name back so the handlebars paths below (and the
        // final scaffold step) all see the `@gmacko/`-stripped value.
        answers.name = parseInitAnswers(answers).name;
        return "Config sanitized";
      },
      {
        type: "add",
        path: "packages/{{ name }}/package.json",
        templateFile: "templates/package.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/tsconfig.json",
        templateFile: "templates/tsconfig.json.hbs",
      },
      {
        type: "add",
        path: "packages/{{ name }}/src/index.ts",
        template: "export const name = '{{ name }}';",
      },
      {
        type: "modify",
        path: "packages/{{ name }}/package.json",
        async transform(content, answers) {
          const { deps } = parseInitAnswers(answers);
          if (deps.length === 0) return content;

          // SAFETY: `content` is the file the preceding `add` action just
          // wrote from templates/package.json.hbs, so it is a JSON object
          // whose `dependencies` field is absent (the template declares only
          // `devDependencies`) or a name → range map written by this loop.
          const pkg = JSON.parse(content) as GeneratedPackageJson;
          for (const dep of deps) {
            const version = await fetch(
              `https://registry.npmjs.org/-/package/${dep}/dist-tags`,
            )
              .then((res) => res.json())
              .then((json) => json.latest);
            pkg.dependencies ??= {};
            pkg.dependencies[dep] = `^${version}`;
          }
          return JSON.stringify(pkg, null, 2);
        },
      },
      async (answers) => {
        /**
         * Install deps and format everything
         */
        const { name } = parseInitAnswers(answers);
        if (name.length === 0) return "Package not scaffolded";

        // execSync("pnpm dlx sherif@latest --fix", {
        //   stdio: "inherit",
        // });
        execSync("pnpm i", { stdio: "inherit" });
        execSync(`pnpm exec biome check packages/${name} --write`, {
          stdio: "inherit",
        });
        return "Package scaffolded";
      },
    ],
  });
}
