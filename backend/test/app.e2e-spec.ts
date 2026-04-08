import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET)', () => {
    return request(app.getHttpServer())
      .get('/')
      .expect(200)
      .expect('NEBULA compiler backend running');
  });

  it('/compiler/compile (POST)', () => {
    return request(app.getHttpServer())
      .post('/compiler/compile')
      .send({
        code: 'Algoritmo Demo\nDefinir x Como Entero\nx <- 10\nEscribir x\nFinAlgoritmo',
      })
      .expect(201)
      .expect((response) => {
        expect(response.body.ok).toBe(true);
        expect(response.body.java).toContain('public class Demo');
      });
  });

  afterEach(async () => {
    await app.close();
  });
});
