import {test,expect} from '@playwright/test';
test('Metro bundles the fixed decoder: a malformed query does not block opening the app',async({page})=>{
  const errors:string[]=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/?qa='+('%FF%41'.repeat(100)));
  await expect(page.getByRole('tab',{name:'Inicio',exact:true})).toBeVisible();
  await expect(page.getByRole('button',{name:'Crear mi primera actividad',exact:true})).toBeEnabled();
  expect(errors).toEqual([]);
});
