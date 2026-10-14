import { expect, type Page } from '@playwright/test';

/** Interact with the same graphical picker as a user; never write hidden fields. */
export async function chooseDate(page: Page, label: string, date: string) {
  const [year, month] = date.split('-').map(Number);
  await page.getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('button', { name: 'Elegir año', exact: true }).click();
  for (let tries = 0; tries < 850; tries++) {
    const target = page.getByRole('button', { name: `Año ${year}`, exact: true });
    if (await target.count()) { await target.click(); break; }
    const years = await page.getByRole('button', { name: /^Año \d+$/ }).evaluateAll(elements => elements.map(element => Number(element.getAttribute('aria-label')?.slice(4))));
    await page.getByRole('button', { name: year < Math.min(...years) ? '12 años anteriores' : '12 años siguientes', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Elegir mes', exact: true }).click();
  await page.getByRole('button', { name: ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'][month - 1], exact: true }).click();
  const day = page.getByTestId(`calendar-day-${date}`);
  const target = await day.boundingBox();
  expect(target?.width, 'Calendar days need the full grid-cell contact area').toBeGreaterThan(35);
  expect(target?.height).toBeGreaterThanOrEqual(40);
  await day.click();
  await page.getByRole('button', { name: 'Elegir esta fecha', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Elegir fecha', exact: true })).toHaveCount(0);
}
