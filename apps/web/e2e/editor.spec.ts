import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const items = (page: Page) => page.locator('svg.stage g.item');

async function compose(page: Page, mode: 'По метафоре' | 'По названиям', text: string) {
  await page.getByRole('tab', { name: mode }).click();
  await page.locator('textarea').first().fill(text);
  await page.getByRole('button', { name: 'Собрать' }).click();
  await expect(page.locator('.variants .variant').first()).toBeVisible({ timeout: 30_000 });
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await expect(page.getByText('Холст пуст')).toBeVisible();
});

test('сценарий 2: названия → композиция и варианты', async ({ page }) => {
  await compose(page, 'По названиям', 'телефон, пазл');
  await expect(items(page)).toHaveCount(2);
  const ids = await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-object')).sort());
  expect(ids).toEqual(['phone', 'puzzle']);
  await expect(page.locator('.variants .variant')).toHaveCount(4);
  await expect(page.locator('.badge').first()).toHaveText('По названиям');
});

test('сценарий 2: непонятное слово → понятная ошибка', async ({ page }) => {
  await page.getByRole('tab', { name: 'По названиям' }).click();
  await page.locator('textarea').first().fill('жираф');
  await page.getByRole('button', { name: 'Собрать' }).click();
  await expect(page.getByRole('alert')).toContainText('жираф');
});

test('сценарий 1: метафора → анализ с объяснением и композиция', async ({ page }) => {
  await compose(page, 'По метафоре', 'Как накопить на мечту');
  await expect(page.locator('.badge').first()).toHaveText('Офлайн-анализ');
  await expect(page.locator('.picks')).toContainText('Монета');
  const ids = await items(page).evaluateAll((els) => els.map((e) => e.getAttribute('data-object')));
  expect(ids).toContain('coin');
});

test('редактирование: добавить, повернуть, дублировать, удалить, отменить', async ({ page }) => {
  await page.locator('.lib-item', { hasText: 'Монета' }).click();
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press('r');
  await expect(page.locator('.layers li.active')).toContainText('15°');
  await page.keyboard.press('ControlOrMeta+d');
  await expect(items(page)).toHaveCount(2);
  await page.keyboard.press('Delete');
  await expect(items(page)).toHaveCount(1);
  await page.keyboard.press('ControlOrMeta+z');
  await expect(items(page)).toHaveCount(2);
});

test('перетаскивание объекта меняет его позицию', async ({ page }) => {
  await page.locator('.lib-item', { hasText: 'Кошелёк' }).click();
  const x = page.getByRole('spinbutton', { name: 'X' });
  const before = Number(await x.inputValue());
  const box = await items(page).first().boundingBox();
  if (!box) throw new Error('нет объекта');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 80, box.y + box.height / 2 + 10, { steps: 8 });
  await page.mouse.up();
  expect(Number(await x.inputValue())).toBeGreaterThan(before + 50);
});

test('перетаскивание из библиотеки на холст', async ({ page }) => {
  await page.locator('.lib-item', { hasText: 'Лампа' }).dragTo(page.locator('svg.stage'));
  await expect(items(page)).toHaveCount(1);
  await expect(items(page).first()).toHaveAttribute('data-object', 'lamp');
});

test('смена схемы перекрашивает фон и объекты', async ({ page }) => {
  await page.locator('.lib-item', { hasText: 'Телефон' }).click();
  await page.getByRole('radio', { name: 'Персик' }).click();
  await expect(page.locator('svg.stage rect[fill="#FDD7B9"]').first()).toBeAttached();
  const html = await items(page).first().innerHTML();
  expect(html).toContain('#D27532');
  expect(html).not.toContain('#7864D7');
});

test('экспорт: скачивается векторный SVG с группами объектов', async ({ page }) => {
  await compose(page, 'По названиям', 'книга, ручка');
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Скачать SVG' }).click()]);
  const path = await download.path();
  const svg = readFileSync(path, 'utf8');
  expect(download.suggestedFilename()).toMatch(/\.svg$/);
  expect(svg).toContain('data-object="book"');
  expect(svg).toContain('data-object="pen"');
  expect(svg).not.toMatch(/<image\b/);
});

test('палитра: загрузка SVG-сетки из Figma перекрашивает композицию', async ({ page }) => {
  await page.locator('.lib-item', { hasText: 'Пазлы' }).click();
  await page.getByRole('button', { name: 'Палитра' }).click();
  const grid = [
    ['#BEEBEB', '#FFD4F2'],
    ['#80DADA', '#6D7BFC'],
    ['#5ABEBE', '#B6C6FE'],
    ['#181817', '#FFFFFF'],
  ]
    .map(([l, r], i) => `<rect x="0" y="${i * 100}" width="200" height="100" fill="${l}"/><rect x="200" y="${i * 100}" width="200" height="100" fill="${r}"/>`)
    .join('');
  await page.locator('.modal input[type=file]').setInputFiles({
    name: 'Мята из Figma.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg">${grid}</svg>`),
  });
  await expect(page.getByLabel('Название')).toHaveValue('Мята из Figma');
  await page.getByRole('button', { name: 'Сохранить и применить' }).click();
  await expect(page.getByRole('radio', { name: 'Мята из Figma' })).toHaveAttribute('aria-checked', 'true');
  expect(await items(page).first().innerHTML()).toContain('#6D7BFC');
});
