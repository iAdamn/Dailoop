import { expect, type Page } from '@playwright/test';

/** Select through the visible exact-minute controls, never through hidden state. */
export async function chooseTime(page: Page, label: string, time: string) {
  const [hour, minute] = time.split(':');
  await page.getByRole('button', { name: label, exact: true }).click();
  const hourButton = page.getByRole('button', { name: `Hora ${hour}`, exact: true });
  let target = await hourButton.boundingBox();
  expect(target?.width, 'Hour needs a full touch target').toBeGreaterThanOrEqual(40);
  expect(target?.height).toBeGreaterThanOrEqual(40);
  await hourButton.click();
  const minuteButton = page.getByRole('button', { name: `Minuto ${minute}`, exact: true });
  target = await minuteButton.boundingBox();
  expect(target?.width, 'Minute needs a full touch target').toBeGreaterThanOrEqual(40);
  expect(target?.height).toBeGreaterThanOrEqual(40);
  await minuteButton.click();
  await page.getByRole('button', { name: 'Elegir esta hora', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elegir hora', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: label, exact: true })).toContainText(time);
}
