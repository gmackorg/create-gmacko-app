"use client";

export interface ScopeOption {
  /** `resource:action`; the part before the colon groups the checkboxes. */
  readonly value: string;
  readonly description: string;
}

const resourceOf = (value: string) => value.split(":", 1)[0] ?? value;

const resourceLabel = (resource: string) =>
  resource
    .split("_")
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(" ");

/**
 * Checkboxes for `resource:action` scopes, grouped by resource. Controlled:
 * the parent owns `value` and gets the next selection from `onChange`, in
 * `options` order. Used by the API-key form and the OAuth consent page, so
 * both show the same names for the same permissions.
 */
export function ScopePicker(props: {
  options: ReadonlyArray<ScopeOption>;
  value: ReadonlyArray<string>;
  onChange: (next: ReadonlyArray<string>) => void;
  disabled?: boolean | undefined;
  /** Prefixes each checkbox `name` (`${name}-${scope}`), for forms and tests. */
  name?: string | undefined;
}) {
  const groups = new Map<string, Array<ScopeOption>>();
  for (const option of props.options) {
    const resource = resourceOf(option.value);
    groups.set(resource, [...(groups.get(resource) ?? []), option]);
  }
  const toggle = (scope: string, checked: boolean) => {
    const selected = new Set(props.value);
    if (checked) selected.add(scope);
    else selected.delete(scope);
    props.onChange(
      props.options
        .map((option) => option.value)
        .filter((value) => selected.has(value)),
    );
  };
  const name = props.name ?? "scope";

  return (
    <div className="grid gap-4 sm:grid-cols-2" data-testid="scope-picker">
      {[...groups].map(([resource, options]) => (
        <fieldset key={resource} className="space-y-2">
          <legend className="text-sm font-medium">
            {resourceLabel(resource)}
          </legend>
          {options.map((option) => (
            <label
              key={option.value}
              className="flex items-start gap-2 text-sm"
            >
              <input
                type="checkbox"
                name={`${name}-${option.value}`}
                checked={props.value.includes(option.value)}
                disabled={props.disabled}
                onChange={(event) =>
                  toggle(option.value, event.target.checked)
                }
                className="mt-0.5 h-4 w-4 rounded border-gray-300"
              />
              <span>
                <span className="block">{option.description}</span>
                <code className="text-muted-foreground text-xs">
                  {option.value}
                </code>
              </span>
            </label>
          ))}
        </fieldset>
      ))}
    </div>
  );
}
