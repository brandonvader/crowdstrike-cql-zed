/**
 * @file Tree-sitter grammar for the CrowdStrike Query Language (CQL / LogScale)
 * @license MIT
 *
 * Based on the published grammar subset:
 *   https://library.humio.com/lql-grammar/syntax-grammar-guide-subset.html
 *
 * CrowdStrike explicitly notes the real parser has quirks that cannot be
 * reproduced with a regular tokenizer (see "Appendix A, Quirks"). This grammar
 * is intentionally lenient: it aims to give a useful tree for editor features
 * (highlighting, brackets, indentation, outline) on real-world queries, not to
 * validate them.
 */

/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  // Filter expressions: NOT > OR > AND (OR binds tighter than AND in CQL).
  filter_and: 1,
  filter_or: 2,
  filter_not: 3,

  // Eval expressions.
  attribute: 1,
  comparison: 2,
  additive: 3,
  multiplicative: 4,
  unary: 5,
};

// Characters allowed in an unquoted pattern chunk (see Appendix C). Everything
// that has syntactic meaning in a filter is excluded. ':' and '/' are handled
// separately so that `foo:=bar` and `foo // comment` lex correctly.
const PATTERN_CHAR = /[^\s"'`(),;=!<>|\[\]{}?$\/:]/;

// Characters allowed in an unquoted field name.
const FIELD_START = /[A-Za-z_@#\u00a1-\uffff]/;
const FIELD_CHAR = /[A-Za-z0-9_@#.%&\\^~\u00a1-\uffff]/;

function commaSep(rule) {
  return optional(commaSep1(rule));
}

function commaSep1(rule) {
  return seq(rule, repeat(seq(',', rule)), optional(','));
}

function semiSep(rule) {
  return seq(optional(rule), repeat(seq(';', optional(rule))));
}

// Logical keywords are case-insensitive in practice (`and`, `AND`, `And`).
function ci(word) {
  const cap = word[0].toUpperCase() + word.slice(1);
  return choice(word, word.toUpperCase(), cap);
}

module.exports = grammar({
  name: 'crowdstrike_cql',

  extras: ($) => [/\s/, $.line_comment, $.block_comment],

  conflicts: ($) => [
    [$.free_text, $._field],
  ],

  rules: {
    source_file: ($) => optional($.pipeline),

    // ------------------------------------------------------------------
    // Pipelines
    // ------------------------------------------------------------------

    // Assignments are also accepted without a preceding `|` (seen throughout
    // the official docs, e.g. `x := 2` on consecutive lines).
    pipeline: ($) =>
      seq(
        optional('|'),
        $._step,
        repeat(choice(seq('|', $._step), $.assignment)),
        optional('|'),
      ),

    _step: ($) =>
      choice(
        $.assignment,
        $.field_shorthand,
        $.case_statement,
        $.match_statement,
        $.stats_shorthand,
        $.saved_query,
        $._filter,
      ),

    // field := expression   (eval shorthand / `as=` shorthand)
    assignment: ($) =>
      seq(field('left', $._field), ':=', field('right', $._expression)),

    // field =~ function(...)
    field_shorthand: ($) =>
      seq(
        field('field', $._field),
        '=~',
        optional('!'),
        field('function', $.function_call),
      ),

    // [count(), max(x)]  ==  stats([count(), max(x)])
    stats_shorthand: ($) => $.array,

    case_statement: ($) =>
      seq('case', '{', semiSep(alias($.pipeline, $.case_branch)), '}'),

    match_statement: ($) =>
      seq(
        field('field', $._field),
        'match',
        '{',
        semiSep($.match_arm),
        '}',
      ),

    match_arm: ($) =>
      seq(
        field('guard', $._match_guard),
        '=>',
        field('body', $.pipeline),
      ),

    _match_guard: ($) =>
      choice(
        $.wildcard,
        $.regex,
        $.function_call,
        $.parameter,
        $.string,
        $.number,
        $.unquoted_pattern,
        $.identifier,
      ),

    // $savedQuery(arg=value) / $"Saved Query"() / $parser://pkg:name()
    saved_query: ($) =>
      seq(
        field('name', $.saved_query_name),
        token.immediate('('),
        commaSep($.named_argument),
        ')',
      ),

    saved_query_name: (_) => token(seq('$', choice(/"([^"\\\n]|\\.)*"/, /[^\s("|]+/))),

    // ------------------------------------------------------------------
    // Filters
    // ------------------------------------------------------------------

    _filter: ($) =>
      choice(
        $.and_filter,
        $.or_filter,
        $.not_filter,
        $._primary_filter,
      ),

    and_filter: ($) =>
      prec.left(
        PREC.filter_and,
        seq(
          field('left', $._filter),
          optional(alias(ci('and'), $.and)),
          field('right', $._filter),
        ),
      ),

    or_filter: ($) =>
      prec.left(
        PREC.filter_or,
        seq(
          field('left', $._filter),
          alias(ci('or'), $.or),
          field('right', $._filter),
        ),
      ),

    not_filter: ($) =>
      prec(
        PREC.filter_not,
        seq(choice(alias(ci('not'), $.not), '!'), field('operand', $._filter)),
      ),

    _primary_filter: ($) =>
      choice(
        $.comparison,
        $.function_call,
        $.parenthesized_filter,
        $.boolean,
        $.free_text,
      ),

    parenthesized_filter: ($) => seq('(', $._filter, ')'),

    comparison: ($) =>
      seq(
        field('field', $._field),
        field('operator', choice('=', '!=', '<', '<=', '>', '>=', 'like', '<=>')),
        field('value', $._filter_value),
      ),

    _filter_value: ($) =>
      choice(
        $.function_call,
        $.string,
        $.regex,
        $.parameter,
        $.number,
        $.duration,
        $.wildcard,
        $.unquoted_pattern,
        $.identifier,
      ),

    free_text: ($) =>
      choice(
        $.string,
        $.regex,
        $.parameter,
        $.wildcard,
        $.unquoted_pattern,
        $.number,
        $.identifier,
      ),

    // ------------------------------------------------------------------
    // Expressions (function arguments, := right-hand side)
    // ------------------------------------------------------------------

    _expression: ($) =>
      choice(
        $.binary_expression,
        $.unary_expression,
        $.attributed_expression,
        $._primary_expression,
      ),

    binary_expression: ($) => {
      const table = [
        [PREC.comparison, choice('==', '!=', '>=', '<=', '>', '<', '<=>')],
        [PREC.additive, choice('+', '-')],
        [PREC.multiplicative, choice('*', '/', '%')],
      ];
      return choice(
        ...table.map(([p, op]) =>
          prec.left(
            /** @type {number} */ (p),
            seq(
              field('left', $._expression),
              // @ts-ignore
              field('operator', op),
              field('right', $._expression),
            ),
          ),
        ),
      );
    },

    unary_expression: ($) =>
      prec(
        PREC.unary,
        seq(field('operator', choice('-', '!')), field('operand', $._expression)),
      ),

    // correlate(): `name: { ... } include: [a, b]`. Attributes only ever
    // follow a subquery in practice; restricting them avoids ambiguity with
    // pipe-less assignments.
    attributed_expression: ($) =>
      prec.left(
        PREC.attribute,
        seq(
          $.subquery,
          repeat1(
            seq(
              field('attribute', alias($.identifier, $.attribute_name)),
              ':',
              $._expression,
            ),
          ),
        ),
      ),

    _primary_expression: ($) =>
      choice(
        $.parenthesized_expression,
        $.subquery,
        $.function_call,
        $.saved_query,
        $.array,
        $.parameter,
        $.string,
        $.regex,
        $.number,
        $.duration,
        $.boolean,
        $.wildcard,
        $.wildcard_pattern,
        $.identifier,
      ),

    parenthesized_expression: ($) => seq('(', $._expression, ')'),

    // { pipeline }  or  label: { pipeline }
    subquery: ($) =>
      seq(
        optional(seq(field('label', alias($.identifier, $.label)), ':')),
        '{',
        optional($.pipeline),
        '}',
      ),

    array: ($) => seq('[', commaSep(choice($.assignment, $._expression)), ']'),

    // ------------------------------------------------------------------
    // Function calls
    // ------------------------------------------------------------------

    function_call: ($) =>
      seq(
        field('name', $.function_name),
        token.immediate('('),
        optional(field('arguments', $.argument_list)),
        ')',
      ),

    function_name: ($) =>
      choice(
        $.identifier,
        $.namespaced_identifier,
        // Keywords that are also function names.
        alias('match', $.identifier),
      ),

    argument_list: ($) => commaSep1(choice($.named_argument, $._expression)),

    named_argument: ($) =>
      seq(
        field('name', alias($._argument_name, $.argument_name)),
        '=',
        field('value', $._expression),
      ),

    _argument_name: ($) => choice($.identifier, $.string),

    // ------------------------------------------------------------------
    // Terminals
    // ------------------------------------------------------------------

    _field: ($) => choice($.identifier, $.string),

    // NOTE: lexical precedence beats match length in tree-sitter, so these
    // terminals deliberately share precedence 0. Longest match wins; ties are
    // broken by the order the rules appear here (earlier wins).

    // array:contains, text:length, ...
    namespaced_identifier: (_) =>
      token(/[A-Za-z_][A-Za-z0-9_]*:[A-Za-z_][A-Za-z0-9_]*/),

    // foo, foo.bar, @timestamp, #event_simpleName, foo[0].bar
    identifier: (_) =>
      token(
        seq(
          FIELD_START,
          repeat(FIELD_CHAR),
          repeat(seq('[', /\d*/, ']', repeat(FIELD_CHAR))),
        ),
      ),

    // 42, 3.14, 1e6, 8.8.8.8
    number: (_) => token(/\d+(\.\d+)*([eE][+-]?\d+)?/),

    // Relative time and other digit-led words: 5m, 1h, 7days, 48656c6c6f
    duration: (_) => token(/\d+(\.\d+)?[A-Za-z][A-Za-z0-9]*/),

    // A bare `*` (match everything / field exists).
    wildcard: (_) => token(/\*+/),

    // Expressions only accept unquoted patterns starting with `*`.
    wildcard_pattern: (_) => token(seq('*', repeat1(PATTERN_CHAR))),

    // Unquoted pattern for filters, e.g. *.exe, docker/*, web-01,
    // https://www.example.com/, C:\Windows\*
    unquoted_pattern: (_) =>
      token(
        seq(
          repeat1(PATTERN_CHAR),
          repeat(seq(/[:\/]+/, repeat1(PATTERN_CHAR))),
          optional('/'),
        ),
      ),

    boolean: (_) => choice('true', 'false'),

    string: ($) =>
      seq(
        '"',
        repeat(choice($.string_content, $.escape_sequence)),
        token.immediate('"'),
      ),

    string_content: (_) => token.immediate(prec(1, /[^"\\\n]+/)),

    escape_sequence: (_) => token.immediate(/\\./),

    regex: ($) =>
      seq(
        '/',
        field('pattern', $.regex_pattern),
        token.immediate('/'),
        optional(field('flags', $.regex_flags)),
      ),

    regex_pattern: (_) =>
      token.immediate(
        prec(
          1,
          repeat1(
            choice(
              /\\./,
              seq('[', repeat(choice(/\\./, /[^\]\\\n]/)), optional(']')),
              /[^\/\\\[\n]/,
            ),
          ),
        ),
      ),

    regex_flags: (_) => token.immediate(prec(5, /[dgimF]+/)),

    // ?name, ?"quoted name", ?{name=default}
    parameter: ($) =>
      choice(
        seq('?', field('name', $._parameter_name)),
        seq(
          '?{',
          field('name', $._parameter_name),
          '=',
          field('default', choice($.string, $.unquoted_pattern, $.wildcard, $.identifier, $.number)),
          '}',
        ),
      ),

    _parameter_name: ($) =>
      alias(
        choice(token.immediate(/[A-Za-z0-9_@#.\-:]+/), $.string),
        $.parameter_name,
      ),

    line_comment: (_) => token(seq('//', /[^\n]*/)),

    block_comment: (_) => token(seq('/*', /[^*]*\*+([^/*][^*]*\*+)*/, '/')),
  },
});
