import Fastify, { FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import Joi from 'joi';
import cors from '@fastify/cors';

const server = Fastify();
const prisma = new PrismaClient();

// Habilitar CORS
server.register(cors, {
  origin: '*', // Ajuste conforme necessário
});

// Interfaces para o corpo das requisições
interface RegisterRequest {
  username: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface PropertyRequest {
  titulo: string;
  descricao: string;
  userId: number;
  imagens: string[];
  latitude: number; // Adicionando latitude
  longitude: number; // Adicionando longitude
}

// Esquemas de validação
const registerSchema = Joi.object<RegisterRequest>({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object<LoginRequest>({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const propertySchema = Joi.object<PropertyRequest>({
  titulo: Joi.string().required(),
  descricao: Joi.string().required(),
  userId: Joi.number().required(),
  imagens: Joi.array().items(Joi.string().uri()).min(1).required(),
  latitude: Joi.number().required(), // Adicionando validação para latitude
  longitude: Joi.number().required(), // Adicionando validação para longitude
});

// Rota de registro de usuários
server.post('/register', async (request: FastifyRequest<{ Body: RegisterRequest }>, reply: FastifyReply) => {
  const { error } = registerSchema.validate(request.body);
  
  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  const { username, password } = request.body;

  try {
    const existingUser = await prisma.user.findUnique({ where: { username } });

    if (existingUser) {
      return reply.status(409).send({ error: 'Username already exists' });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    
    const user = await prisma.user.create({
      data: {
        username,
        password: hashedPassword,
      },
    });

    return reply.status(201).send({ user });
  } catch (error) {
    console.error('Error creating user:', error);
    return reply.status(500).send({ error: 'Failed to create user' });
  }
});

// Rota de login
server.post('/login', async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
  const { error } = loginSchema.validate(request.body);
  
  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  const { username, password } = request.body;

  try {
    const user = await prisma.user.findUnique({ where: { username } });

    if (!user || !(await bcrypt.compare(password, user.password))) {
      return reply.status(401).send({ error: 'Invalid username or password' });
    }

    return reply.send({ message: 'Login successful', user });
  } catch (error) {
    console.error('Error during login:', error);
    return reply.status(500).send({ error: 'Failed to login' });
  }
});

// Rota de buscar usuário por ID
server.get('/users/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const userId = Number(request.params.id); 

  if (isNaN(userId)) {
    return reply.status(400).send({ error: 'Invalid userId' });
  }

  try {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    
    if (!user) {
      return reply.status(404).send({ error: 'Usuário não encontrado' });
    }

    return reply.send(user);
  } catch (error) {
    console.error(error);
    return reply.status(500).send({ error: 'Failed to fetch user' });
  }
});

// Rota de registro de imóveis
server.post('/imoveis', async (request: FastifyRequest<{ Body: PropertyRequest }>, reply: FastifyReply) => {
  const { error } = propertySchema.validate(request.body);

  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  const { titulo, descricao, userId, imagens, latitude, longitude } = request.body; // Incluindo latitude e longitude

  try {
    const userExists = await prisma.user.findUnique({ where: { id: userId } });

    if (!userExists) {
      return reply.status(404).send({ error: 'Usuário não encontrado, deve estar logado para adicionar!' });
    }

    const imovel = await prisma.imovel.create({
      data: {
        titulo,
        descricao,
        userId,
        imagens: {
          create: imagens.map((url: string) => ({ url })), // Especificando o tipo de url
        },
        latitude, // Armazenando latitude
        longitude, // Armazenando longitude
      },
      include: { imagens: true },
    });

    return reply.status(201).send({ imovel });
  } catch (error) {
    console.error('Error creating property:', error);
    return reply.status(500).send({ error: 'Falha ao criar imóvel' });
  }
});

// Rota para listar imóveis
server.get('/imoveis', async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const imoveis = await prisma.imovel.findMany({ include: { imagens: true } });
    return reply.send(imoveis);
  } catch (error) {
    console.error('Erro ao buscar imóveis:', error);
    return reply.status(500).send({ error: 'Falha ao buscar imóveis' });
  }
});

// Rota para listar imóveis de um usuário específico
server.get('/imoveis/user', async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
  const { userId } = request.query;

  const numericUserId = Number(userId); // Converte userId para número

  if (isNaN(numericUserId)) {
    return reply.status(400).send({ error: 'UserId é obrigatório e deve ser um número' });
  }

  try {
    const imoveis = await prisma.imovel.findMany({
      where: { userId: numericUserId },
      include: { imagens: true },
    });

    if (imoveis.length === 0) {
      return reply.status(404).send({ message: 'Nenhum imóvel encontrado para este usuário' });
    }

    return reply.send(imoveis);
  } catch (error) {
    console.error('Erro ao buscar imóveis do usuário:', error);
    return reply.status(500).send({ error: 'Falha ao buscar imóveis' });
  }
});

// Rota para obter detalhes de um imóvel específico
server.get('/imoveis/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const { id } = request.params;
  console.log('ID recebido:', id); // Log para verificar o ID
  console.log('Fetching property with ID:', id);

  const propertyId = Number(id);
  if (isNaN(propertyId)) {
    return reply.status(400).send({ error: 'ID deve ser um número válido' });
  }

  try {
    console.log('Buscando imóvel com ID:', propertyId); // Log do ID que será buscado
    const imovel = await prisma.imovel.findUnique({
      where: {
        id: propertyId,
      },
      include: { imagens: true },
    });

    if (!imovel) {
      return reply.status(404).send({ error: 'Imóvel não encontrado' });
    }

    return reply.send(imovel);
  } catch (error) {
    console.error('Erro ao buscar imóvel:', error);
    return reply.status(500).send({ error: 'Falha ao buscar imóvel' });
  }
});


// Rota para editar um imóvel
server.put('/imoveis/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: PropertyRequest }>, reply: FastifyReply) => {
  const { id } = request.params;
  const { titulo, descricao, imagens, latitude, longitude, userId } = request.body; // Inclua userId aqui

  // Validação do ID do imóvel
  const propertyId = Number(id);
  if (isNaN(propertyId)) {
    return reply.status(400).send({ error: 'ID do imóvel deve ser um número' });
  }

  // Validação dos dados do imóvel
  const { error } = propertySchema.validate({ titulo, descricao, imagens, latitude, longitude, userId }); // Inclua userId na validação
  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  try {
    // Verifica se o imóvel existe antes de tentar editar
    const existingProperty = await prisma.imovel.findUnique({ where: { id: propertyId } });
    if (!existingProperty) {
      return reply.status(404).send({ error: 'Imóvel não encontrado' });
    }

    // Atualiza o imóvel
    const imovel = await prisma.imovel.update({
      where: { id: propertyId },
      data: {
        titulo,
        descricao,
        latitude,
        longitude,
        imagens: {
          deleteMany: {}, // Remove as imagens antigas
          create: imagens.map((url: string) => ({ url })), // Adiciona as novas imagens
        },
      },
      include: { imagens: true },
    });

    return reply.status(200).send(imovel);
  } catch (error) {
    console.error('Erro ao editar imóvel:', error);
    return reply.status(500).send({ error: 'Falha ao editar imóvel' });
  }
});

// Rota para deletar um imóvel
server.delete('/imoveis/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const { id } = request.params;

  const propertyId = Number(id);
  if (isNaN(propertyId)) {
    return reply.status(400).send({ error: 'ID do imóvel deve ser um número válido' });
  }

  try {
    // Verifica se o imóvel existe antes de tentar deletar
    const existingProperty = await prisma.imovel.findUnique({
      where: { id: propertyId },
      include: { imagens: true }, // Inclui as imagens para verificar se existem
    });
    
    if (!existingProperty) {
      return reply.status(404).send({ error: 'Imóvel não encontrado' });
    }

    // Deleta todas as imagens associadas ao imóvel
    await prisma.imagem.deleteMany({ where: { imovelId: propertyId } });

    // Deleta o imóvel
    await prisma.imovel.delete({ where: { id: propertyId } });

    return reply.status(200).send({ message: 'Imóvel deletado com sucesso' });
  } catch (error) {
    console.error('Erro ao deletar imóvel:', error);
    return reply.status(500).send({ error: 'Falha ao deletar imóvel' });
  }
});

// Iniciar o servidor
server.listen({ port: 3000, host: '0.0.0.0' }, (err) => {
  if (err) {
    console.error('Error starting server:', err);
    process.exit(1);
  }
  console.log('Server listening at http://localhost:3000');
});
