// happy-dom has no ElementInternals; real browsers are covered by the Playwright suite.
const proto = HTMLElement.prototype as unknown as { attachInternals?: () => unknown };
if (!proto.attachInternals)
  proto.attachInternals = () => ({ form: null, setFormValue() {}, setValidity() {} });
