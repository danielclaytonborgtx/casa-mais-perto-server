import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import Joi from "joi";
import { google } from 'googleapis';
import { OAuth2Client } from 'google-auth-library';

const server = Fastify();
const prisma = new PrismaClient();

const client = new OAuth2Client('468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com');

// Habilitar CORS
server.register(cors, {
  origin: "*", // Ajuste conforme necessário
});

// Interfaces para o corpo das requisições
interface RegisterRequest {
  name: string;
  email: string;
  username: string;
  password: string;
}

interface LoginRequest {
  username: string;
  password: string;
}

interface PropertyRequest {
  title: string;
  description: string;
  price: number;
  latitude: number;
  longitude: number;
  userId: number;
  images: string[];
}

// Esquemas de validação
const registerSchema = Joi.object<RegisterRequest>({
  name: Joi.string().required(),
  email: Joi.string().email().required(),
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const loginSchema = Joi.object<LoginRequest>({
  username: Joi.string().min(3).max(30).required(),
  password: Joi.string().min(6).required(),
});

const propertySchema = Joi.object<PropertyRequest>({
  title: Joi.string().required(),
  description: Joi.string().required(),
  price: Joi.number().required(),
  latitude: Joi.number().required(),
  longitude: Joi.number().required(),
  userId: Joi.number().required(),
  images: Joi.array().items(Joi.string()).optional(),
});

// Rota de registro de usuários
server.post(
  "/users",
  async (
    request: FastifyRequest<{ Body: RegisterRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = registerSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { name, email, username, password } = request.body;

    try {
      const existingUser = await prisma.user.findUnique({
        where: { username },
      });

      if (existingUser) {
        return reply.status(409).send({ error: "Username já utilizado" });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await prisma.user.create({
        data: {
          name,
          email,
          username,
          password: hashedPassword,
        },
      });

      return reply.status(201).send({ user });
    } catch (error) {
      console.error("Erro ao criar usuário:", error);
      return reply.status(500).send({ error: "Falha ao criar usuário" });
    }
  }
);

// Rota de login via e-mail e senha
server.post(
  "/session",
  async (request: FastifyRequest<{ Body: LoginRequest }>, reply: FastifyReply) => {
    const { error } = loginSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { username, password } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { username } });
      console.log("Usuário encontrado:", user);

      if (!user || !(await bcrypt.compare(password, user.password))) {
        console.error("Erro: Usuário ou senha inválidos");
        return reply.status(401).send({ error: "Invalid username or password" });
      }

      // Garantir que o campo picture seja tratado como opcional
      return reply.send({
        message: "Login successful",
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          username: user.username,
          picture: user.picture || null, // Definir como null se não houver imagem
        },
      });
    } catch (error) {
      console.error("Erro ao fazer login:", error);
      return reply.status(500).send({ error: "Falha ao fazer login" });
    }
  }
);

// Rota de login com Google (ID Token)
server.post(
  "/google-login",
  async (request: FastifyRequest<{ Body: { id_token: string } }>, reply: FastifyReply) => {
    const { id_token } = request.body;

    try {
      // Verificar o ID token do Google usando o client OAuth2Client
      const ticket = await client.verifyIdToken({
        idToken: id_token,
        audience: '468088106800-vrpeq16jtc739ngvvvf3a8mrdbpd5is5.apps.googleusercontent.com', // ID do cliente Google
      });

      const payload = ticket.getPayload();

      if (payload && payload.email && payload.name) {
        // Gerar uma senha temporária ou aleatória
        const tempPassword = Math.random().toString(36).slice(-8);

        // Verifique ou crie um usuário baseado no payload do Google
        const user = await prisma.user.upsert({
          where: { email: payload.email },
          update: {},
          create: {
            email: payload.email,
            username: payload.email,
            name: payload.name,
            picture: payload.picture || '', // Defina uma string vazia se a imagem estiver indefinida
            password: await bcrypt.hash(tempPassword, 10),
          },
        });

        return reply.send({ message: "Login successful", user });
      }

      return reply.status(400).send({ error: 'Google login failed: informações incompletas' });
    } catch (error) {
      console.error('Erro ao autenticar com o Google:', error);
      return reply.status(500).send({ error: 'Erro no login com o Google' });
    }
  }
);

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
server.post(
  "/property",
  async (
    request: FastifyRequest<{ Body: PropertyRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = propertySchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { title, description, userId, price, latitude, longitude } =
      request.body;

    try {
      const userExists = await prisma.user.findUnique({
        where: { id: userId },
      });

      if (!userExists) {
        return reply.status(404).send({
          error: "Usuário não encontrado, deve estar logado para adicionar!",
        });
      }

      const property = await prisma.property.create({
        data: {
          title,
          description,
          userId,
          latitude,
          longitude,
          price,
        },
      });

      return reply.status(201).send({ property });
    } catch (error) {
      console.error("Erro ao criar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao criar imóvel" });
    }
  }
);

// Rota para listar imóveis
server.get(
  "/property",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const properties = await prisma.property.findMany({
        include: { images: true },
      });
      return reply.send(properties);
    } catch (error) {
      console.error("Erro ao buscar imóveis:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
  }
);

// Rota para listar imóveis de um usuário específico
server.get('/property/user', async (request: FastifyRequest<{ Querystring: { userId: string } }>, reply: FastifyReply) => {
  const { userId } = request.query;

  const numericUserId = Number(userId); // Converte userId para número

  if (isNaN(numericUserId)) {
    return reply.status(400).send({ error: 'UserId é obrigatório e deve ser um número' });
  }

  try {
    const imoveis = await prisma.property.findMany({
      where: { userId: numericUserId },
      include: { images: true },
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
server.get('/property/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
  const { id } = request.params;
  console.log('ID recebido:', id); // Log para verificar o ID
  console.log('Fetching property with ID:', id);

  const propertyId = Number(id);
  if (isNaN(propertyId)) {
    return reply.status(400).send({ error: 'ID deve ser um número válido' });
  }

  try {
    console.log('Buscando imóvel com ID:', propertyId); // Log do ID que será buscado
    const imovel = await prisma.property.findUnique({
      where: {
        id: propertyId,
      },
      include: { images: true },
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
server.put('/property/:id', async (request: FastifyRequest<{ Params: { id: string }; Body: PropertyRequest }>, reply: FastifyReply) => {
  const { id } = request.params;
  const { title, description, price, latitude, longitude, userId, images } = request.body; // Inclua userId aqui

  // Validação do ID do imóvel
  const propertyId = Number(id);
  if (isNaN(propertyId)) {
    return reply.status(400).send({ error: 'ID do imóvel deve ser um número' });
  }

  // Validação dos dados do imóvel
  const { error } = propertySchema.validate({ title, description, images, latitude, longitude, userId }); // Inclua userId na validação
  if (error) {
    return reply.status(400).send({ error: error.details[0].message });
  }

  try {
    // Verifica se o imóvel existe antes de tentar editar
    const existingProperty = await prisma.property.findUnique({ where: { id: propertyId } });
    if (!existingProperty) {
      return reply.status(404).send({ error: 'Imóvel não encontrado' });
    }

    // Atualiza o imóvel
    const imovel = await prisma.property.update({
      where: { id: propertyId },
      data: {
        title,
        description,
        latitude,
        longitude,
        images: {
          deleteMany: {}, // Remove as imagens antigas
          create: images.map((url: string) => ({ url })), // Adiciona as novas imagens
        },
      },
      include: { images: true },
    });

    return reply.status(200).send(imovel);
  } catch (error) {
    console.error('Erro ao editar imóvel:', error);
    return reply.status(500).send({ error: 'Falha ao editar imóvel' });
  }
});

// Rota para deletar um imóvel
server.delete(
  "/property/:id",
  async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;

    const propertyId = Number(id);
    if (isNaN(propertyId)) {
      return reply
        .status(400)
        .send({ error: "ID do imóvel deve ser um número válido" });
    }

    try {
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { images: true },
      });

      if (!existingProperty) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      await prisma.image.deleteMany({ where: { propertyId } });
      await prisma.property.delete({ where: { id: propertyId } });

      return reply.status(200).send({ message: "Imóvel deletado com sucesso" });
    } catch (error) {
      console.error("Erro ao deletar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao deletar imóvel" });
    }
  }
);

// Iniciar o servidor
server.listen({ port: 3333, host: "0.0.0.0" }, (err) => {
  if (err) {
    console.error("Error starting server:", err);
    process.exit(1);
  }
  console.log("Server listening at http://localhost:3333");
});
