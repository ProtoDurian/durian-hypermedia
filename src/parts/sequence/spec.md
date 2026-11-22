#### Sequence

````
```sequence title="One init call"
actor dev "developer"
participant cli "CLI"
participant tc "template container"
dev -> cli: cyanprint create
cli -> tc: init call, all answers
tc --> cli: question reply
note tc: the script stopped at a question
loop until no question is left
  cli -> tc: init call, one more answer
  tc --> cli: question reply
end
cli --> dev: project written
```
````

- **Participants:** `participant`, `actor`, `database`, `queue`, `service` (`<kind> <id> "label"`), in the order written; one used with no line is added at the end. An id is letters, digits, `-`, `_` and `.`. At most 12.
- **Messages:** `a -> b: text` (a call), `a --> b: text` (a reply, dashed), `a ->> b: text` (async), `a -x b: text` (lost), `a -> a: text` (to itself). **Blocks:** `loop`, `alt` / `else`, `opt`, `par` / `and`, each closed by `end`, 3 deep at most. `note <id>: text`, `note <a> <b>: text`. An activation bar runs from a call to its reply.
- **Steps:** `@step <caption>` groups the messages after it; step k shows the messages up to its end, its own draw themselves, the earlier ones fade. `steps=each` on the fence makes every message a step (with no `@step` lines). **Static:** `static=` on the fence draws one step whole.
- **LLM view:** `Sequence: <title>. Participants: ...`, then the numbered messages, a block's messages indented under `loop <text>:`.
- **Phone:** the heads stay at the top while the box scrolls; three or more participants scroll sideways in the part's own box.
- **Caps:** `sequenceParticipants` (12), `sequenceItems` (200; 120 in UNTRUSTED_LIMITS) lines of participants, messages, blocks and notes together, and `sequenceDepth` (3).
- **doccheck refuses:** an `end`, `else` or `and` with no block open (or an `else` in a loop, an `and` in an alt), a block never closed, blocks nested too deep, a message or note with no text, an unknown participant kind, a participant declared twice, mermaid's `participant A as B`, an id with a character outside the set, a line that is none of these, no message at all, more participants or lines than the caps, `steps=each` with `@step` lines or with fewer than 2 messages, an unknown attribute, and a part over the page's work budget.
