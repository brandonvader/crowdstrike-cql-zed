; Later patterns take precedence over earlier ones in Zed.

; ---------------------------------------------------------------------------
; Identifiers / fields
; ---------------------------------------------------------------------------

; In eval expressions, bare words are field references.
(identifier) @variable

; Left-hand side of filters, assignments, `=~` and `match` is always a field.
(comparison field: (identifier) @property)
(assignment left: (identifier) @property)
(field_shorthand field: (identifier) @property)
(match_statement field: (identifier) @property)

; Tag fields (#event_simpleName, #repo) and metadata fields (@timestamp)
((identifier) @tag
  (#match? @tag "^#"))
((identifier) @variable.special
  (#match? @variable.special "^@"))

; Quoted field names
(comparison field: (string) @property)
(assignment left: (string) @property)

; ---------------------------------------------------------------------------
; Filter values and free-text search terms
; ---------------------------------------------------------------------------
; The right-hand side of a filter comparison is never a field reference, so
; bare words there are highlighted as (unquoted) strings.

(unquoted_pattern) @string.special
(wildcard) @string.special
(wildcard_pattern) @string.special
(comparison value: (identifier) @string.special)
(free_text (identifier) @string.special)
(match_arm guard: (identifier) @string.special)

; ---------------------------------------------------------------------------
; Functions, arguments, saved queries
; ---------------------------------------------------------------------------

(function_name) @function
(function_name (identifier) @function)
(function_name (namespaced_identifier) @function)

; Zed tries the rightmost capture first and falls back leftwards.
(argument_name) @property @variable.parameter
(argument_name (identifier) @property @variable.parameter)

(saved_query_name) @function @preproc

(subquery label: (label) @label)
(attributed_expression attribute: (attribute_name) @attribute)

; ?param, ?"param", ?{param=default}
(parameter) @constant
(parameter_name) @constant
(parameter_name (string_content) @constant)
(parameter "?" @constant)
(parameter "?{" @punctuation.special)
(parameter "}" @punctuation.special)

; ---------------------------------------------------------------------------
; Literals
; ---------------------------------------------------------------------------

(string) @string
(escape_sequence) @string.escape
(regex) @string.regex
(number) @number
(duration) @number
(boolean) @boolean

(line_comment) @comment
(block_comment) @comment

; ---------------------------------------------------------------------------
; Keywords & operators
; ---------------------------------------------------------------------------

[
  "case"
  "match"
] @keyword

(and) @keyword
(or) @keyword
(not) @keyword
(comparison operator: "like" @keyword)

[
  "="
  "!="
  "<"
  "<="
  ">"
  ">="
  "=="
  "<=>"
  ":="
  "=~"
  "=>"
  "+"
  "-"
  "*"
  "/"
  "%"
  "!"
] @operator

; The pipe is the backbone of every query; make it stand out.
"|" @operator @punctuation.special

[
  "("
  ")"
  "["
  "]"
  "{"
  "}"
] @punctuation.bracket

[
  ","
  ";"
  ":"
] @punctuation.delimiter

; Regex delimiters/flags must come after the generic "/" operator above.
(regex "/" @string.regex)
(regex_flags) @keyword
