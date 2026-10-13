import {test,expect} from '@playwright/test';

test('a double registry write failure blocks writes until durable recovery',async({page})=>{
  await page.goto('/__storage-tests');await page.getByRole('button',{name:'uncertain',exact:true}).click();
  await expect(page.getByTestId('storage-result')).toContainText('"recovered":true');
  expect(JSON.parse(await page.getByTestId('storage-result').innerText())).toEqual({failed:true,blocked:true,recovered:true});
});

test('real store preserves revisions, idempotency, atomic rollback and repeatable backup restoration',async({page})=>{
  await page.goto('/__storage-tests');await page.getByRole('button',{name:'contract',exact:true}).click();
  await expect(page.getByTestId('storage-result')).toContainText('"reopen":true');
  const result=JSON.parse(await page.getByTestId('storage-result').innerText());
  expect(result).toMatchObject({two:true,idempotency:true,rollback:true,restore:true,reopen:true,audit:true,projectionRepair:true});
});
for(const phase of ['prepared','activated'])test(`recovers after document dies at restore-${phase}`,async({page,context})=>{
  await page.goto('/__storage-tests');await page.getByRole('button',{name:phase,exact:true}).click();
  await expect(page.getByTestId('storage-result')).toContainText(`"paused":"restore-${phase}"`);
  await page.close();const next=await context.newPage();await next.goto('/__storage-tests');
  await next.getByRole('button',{name:'reopen',exact:true}).click();await expect(next.getByTestId('storage-result')).toContainText('"reopened":true');
  const result=JSON.parse(await next.getByTestId('storage-result').innerText());
  expect(result.activities).toContain('Storage contract');
  if(phase==='prepared')expect(result.activities).toContain('Extra before restore');
  else expect(result.activities).not.toContain('Extra before restore');
  expect(result.entries).toBe(2);
});
