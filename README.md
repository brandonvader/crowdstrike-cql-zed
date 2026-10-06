# CrowdStrike CQL for Zed

Zed language support for the **CrowdStrike Query Language** (CQL, formerly
LogScale Query Language / Humio), as used in Falcon NG-SIEM and LogScale.

| File types | `.logscale`, `.ngsiem`, `.lql` |
| --- | --- |

> `.cql` is intentionally **not** claimed: it collides with Cassandra CQL.
> To use it anyway, add this to your Zed `settings.json`:
>
> ```json
> "file_types": { "CrowdStrike CQL": ["cql"] }
> ```

## Features

- **Syntax highlighting** that follows CQL semantics:
  - left side of `=`, `:=`, `=~`, `match` → field (`@property`)
  - right side of a filter comparison → unquoted string, never a field (this
    is the most common CQL gotcha: `a = b` compares field `a` to the *string* `"b"`)
  - `#tag` fields (`#event_simpleName`, `#repo`) → `@tag`
  - `@timestamp`, `@rawstring`, … → `@variable.special`
  - function names, named arguments, `?parameters`, `$"saved queries"()`,
    correlate labels, durations (`5m`, `1h`)
- **Regex highlighting** inside `/regex/flags` literals (via Zed's built-in
  regex grammar)
- **Outline panel**: every pipeline stage (`groupBy`, `x := …`, `case`,
  `match`, saved queries), nested through subqueries and correlate labels
- Bracket matching / rainbow brackets, auto-indent inside `()`, `[]`, `{}`
- Comment toggling (`//` and `/* */`)
- Vim text objects: `af`/`if` (function call / arguments), `ac`/`ic`
  (subquery, `case`, `match`)
- **Snippets**: `proc`, `gb`, `gbm`, `case`, `match`, `if`, `in`, `cidr`, `rx`,
  `deftable`, `correlate`, `tc`, `ft`, `ptree`, `param`

There is no language server. CrowdStrike does not ship a standalone CQL LSP,
so there are no diagnostics or schema-aware completions.

## Accuracy and known limitations

The grammar is derived from CrowdStrike's published
[grammar subset](https://library.humio.com/lql-grammar/syntax-grammar-guide-subset.html).
CrowdStrike documents that the real parser has
[quirks](https://library.humio.com/lql-grammar/syntax-grammar-guide-appendix-a.html)
that a conventional tokenizer cannot replicate, so this grammar is
deliberately **lenient**: it aims to highlight real queries correctly, not to
validate them.

Correctly handled quirks include:

| Query | Parsed as |
| --- | --- |
| `a OR b c` | `(a OR b) AND c` — OR binds tighter than AND |
| `a:=m/fisk/i` | division: `m / fisk / i` |
| `foo=m/fisk/i` | `foo` equals the string `m/fisk/i` |
| `https://www.example.com/` | free-text pattern, not a comment |
| `repo.name=docker/*` | wildcard pattern |
| `match(file=…)` vs `x match { … }` | function call vs match statement |

Known gaps:

- `https: //example.com` (space before `//`) is mis-tokenized; quote it.
- Unquoted field names containing `-` are not recognized (CQL also rejects
  them; quote them: `"host-name"=*`).
- Function names are not validated against CrowdStrike's reserved word list;
  anything shaped like `name(` is treated as a function call.
- Consecutive assignments without `|` are accepted (some docs examples use
  this form).

Against ~1,900 code examples scraped from the LogScale docs, ~94.7% parse
without errors; the remainder are doc fragments (placeholders such as `...`,
truncated multi-part examples, or input/output tables).

## Development

Requirements: Zed, Node.js (for the tree-sitter CLI), a C compiler.

```sh
cd grammar
npm install
npx tree-sitter generate   # regenerate src/parser.c after editing grammar.js
npx tree-sitter test       # run test/corpus
npx tree-sitter parse ../examples/sample.logscale
```

Install in Zed: command palette → **zed: install dev extension** → select this
directory. Check `zed: open log` for grammar build errors.

Validate snippets (Zed treats every unescaped `$` as a tab stop, so regex
anchors must be written `\\$`):

```sh
python3 grammar/scripts/check-snippets.py
```

**Important:** Zed builds the grammar from the git commit (fetched from GitHub) in
`extension.toml` → `[grammars.crowdstrike_cql].rev`, not from your working
tree. After changing the grammar: commit and push, update `rev` to the new SHA,
then rebuild the dev extension in Zed's Extensions page.

Query files live in `languages/cql/` and are read straight from disk; they
only need a dev-extension rebuild, not a new `rev`.

To check which highlight capture wins for each token (Zed semantics: later
patterns win):

```sh
cd grammar
npx tree-sitter query ../languages/cql/highlights.scm ../examples/sample.logscale \
  | python3 scripts/resolve-highlights.py ../examples/sample.logscale
```

## License

Copyright (C) 2026 Brandon Vader

Licensed under the GNU General Public License v3.0 (GPL-3.0-only); see
[`LICENSE`](LICENSE). Anyone who distributes a modified version must release
its source under the same license.
