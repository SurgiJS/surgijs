# @surgijs/ui

## 0.4.0

### Minor Changes

- [#44](https://github.com/SurgiJS/surgijs/pull/44) [`47183be`](https://github.com/SurgiJS/surgijs/commit/47183be763d3b790e07d411af14896430e5eaf1c) Thanks [@banzalik](https://github.com/banzalik)! - `@surgijs/ui/angular` exports a directive per component, `SButtonDirective` for `<s-button>`, with an input for each prop of its props interface. Angular checks template bindings against those inputs, so an unknown `variant` or a value of the wrong type is a compile error, and the directive forwards each input to the element. Generated from the same manifest as the React and Vue typings.

### Patch Changes

- [#49](https://github.com/SurgiJS/surgijs/pull/49) [`24003d0`](https://github.com/SurgiJS/surgijs/commit/24003d07d685c7b2829f5aa44c10fefff44c95da) Thanks [@banzalik](https://github.com/banzalik)! - Boolean inputs of the Angular directives go through `booleanAttribute`, as Angular's own boolean inputs do. `<s-button disabled>` disables the button and `disabled="false"` leaves it enabled; with strict templates both compile.

- [#43](https://github.com/SurgiJS/surgijs/pull/43) [`fc3c135`](https://github.com/SurgiJS/surgijs/commit/fc3c135bd2997bd883c9bb75efe024628590b5a8) Thanks [@banzalik](https://github.com/banzalik)! - Theme tokens are defined once in `packages/ui/tokens`. Style Dictionary generates `themes.css` from them, and the same files produce the Figma token sets in `packages/ui/tokens/figma` and the design tokens page in the docs. The token values do not change.

- [#41](https://github.com/SurgiJS/surgijs/pull/41) [`22ffcc9`](https://github.com/SurgiJS/surgijs/commit/22ffcc92cd52380ecc3f16bc63b91d7ec4c383c1) Thanks [@banzalik](https://github.com/banzalik)! - `<s-button>` styles use logical CSS properties (`padding-inline`, `border-inline-end-color`), so it follows `dir="rtl"` without overrides. The Storybook toolbar has a direction switch, and the e2e suite has RTL screenshots and a layout check.

## 0.3.0

### Minor Changes

- [#32](https://github.com/SurgiJS/surgijs/pull/32) [`596beaf`](https://github.com/SurgiJS/surgijs/commit/596beafa954a7f03be80e45ac8df5b45fa4203fe) Thanks [@banzalik](https://github.com/banzalik)! - Built with `@surgijs/compiler` 0.7, which imports runtime helpers from `@surgijs/core/internal`; the `@surgijs/core` peer range starts at 0.7.0.

## 0.2.0

### Minor Changes

- [#30](https://github.com/SurgiJS/surgijs/pull/30) [`7bb6dfd`](https://github.com/SurgiJS/surgijs/commit/7bb6dfd63df296e3961fe2be7834c6a2891ab88b) Thanks [@banzalik](https://github.com/banzalik)! - Changes from the withdrawn 1.0.0 and 2.0.0 releases, which were published by mistake and are removed from npm. `<s-button>` uses the shared stylesheet from `defineComponent({ styles })`, adopted through `adoptedStyleSheets` instead of a `<style>` per element.
