// @vitest-environment jsdom
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { i18nReady } from '../../i18n';
import { Notice } from '../Notice';
import { SideMark } from '../SideMark';
import { Segmented } from '../Segmented';
import { Unresolved } from '../Unresolved';
import { Field } from '../Field';
import { EmptyState } from '../EmptyState';

let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;

async function render(element: JSX.Element) {
  await act(async () => { root.render(element); });
}

beforeEach(async () => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  await i18nReady;
  container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe('shared shell parts', () => {
  it('Notice shows a symbol and a text label for every tone, so colour is not the only cue', async () => {
    await render(<><Notice tone="info">a</Notice><Notice tone="warning">b</Notice><Notice tone="error">c</Notice><Notice tone="success">d</Notice></>);

    const symbols = [...container.querySelectorAll('.notice-symbol')].map(node => node.textContent);
    expect(symbols).toEqual(['i', '▲', '×', '✓']);
    expect(container.querySelector('.notice-error')?.getAttribute('role')).toBe('alert');
    expect(container.textContent).toContain('注意');
    expect(container.textContent).toContain('エラー');
  });

  it('SideMark names the coalition in text beside its shape', async () => {
    await render(<><SideMark side="blue" /><SideMark side="red" /><SideMark side="neutral" /></>);

    const marks = [...container.querySelectorAll('.side-mark')];
    expect(marks.map(node => node.getAttribute('data-side'))).toEqual(['blue', 'red', 'neutral']);
    expect(marks.map(node => node.querySelector('.side-mark-label')?.textContent)).toEqual(['青', '赤', '中立']);
  });

  it('Segmented marks the pressed option and reports the chosen value', async () => {
    const onChange = vi.fn();
    await render(
      <Segmented
        label="表示"
        value="pilot"
        onChange={onChange}
        options={[{ value: 'creator', label: '作成者' }, { value: 'pilot', label: 'パイロット' }]}
      />,
    );

    const buttons = [...container.querySelectorAll('button')];
    expect(buttons.map(node => node.getAttribute('aria-pressed'))).toEqual(['false', 'true']);
    await act(async () => { buttons[0].click(); });
    expect(onChange).toHaveBeenCalledWith('creator');
  });

  it('Unresolved shows the DCS position when there is one and never draws a zero point', async () => {
    await render(<><Unresolved xy={[1200.4, -300.6]} /><Unresolved /></>);

    const notes = [...container.querySelectorAll('.unresolved')];
    expect(notes[0].textContent).toContain('未解決');
    expect(notes[0].textContent).toContain('1200, -301');
    expect(notes[1].textContent).not.toContain('DCS');
    expect(container.textContent).not.toContain('0, 0');
  });

  it('Field puts the label above the control and connects them', async () => {
    await render(
      <Field label="座標（単位つき）" disabledReason="編集できません">
        {id => <input id={id} />}
      </Field>,
    );

    const label = container.querySelector('label');
    const input = container.querySelector('input');
    expect(label?.htmlFor).toBe(input?.id);
    expect(container.querySelector('.field-reason')?.textContent).toBe('編集できません');
  });

  it('EmptyState renders its title and optional body', async () => {
    await render(<EmptyState title="空です" body="次の操作" />);
    expect(container.querySelector('.empty-state-title')?.textContent).toBe('空です');
    expect(container.querySelector('.empty-state-body')?.textContent).toBe('次の操作');
  });
});
