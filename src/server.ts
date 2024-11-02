import cors from "@fastify/cors";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcrypt";
import Fastify, { FastifyReply, FastifyRequest } from "fastify";
import Joi from "joi";

const server = Fastify();
const prisma = new PrismaClient();

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
}

// Esquemas de validação
const registerSchema = Joi.object<RegisterRequest>({
  name: Joi.string().required(),
  email: Joi.string().required(),
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
      const findExistingUserWithSameUsername = await prisma.user.findUnique({
        where: { username },
      });

      if (findExistingUserWithSameUsername) {
        return reply.status(409).send({ error: "Username já utilizado" });
      }

      const findExistingUserWithSameEmail = await prisma.user.findUnique({
        where: { email },
      });

      if (findExistingUserWithSameEmail) {
        return reply.status(409).send({ error: "E-mail já utilizado" });
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
      console.error("Error creating user:", error);
      return reply.status(500).send({ error: "Failed to create user" });
    }
  }
);

// Rota de login
server.post(
  "/session",
  async (
    request: FastifyRequest<{ Body: LoginRequest }>,
    reply: FastifyReply
  ) => {
    const { error } = loginSchema.validate(request.body);

    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    const { username, password } = request.body;

    try {
      const user = await prisma.user.findUnique({ where: { username } });

      if (!user || !bcrypt.compare(password, user.password)) {
        return reply
          .status(401)
          .send({ error: "Invalid username or password" });
      }

      return reply.send({ message: "Login successful", user });
    } catch (error) {
      console.error("Error during login:", error);
      return reply.status(500).send({ error: "Failed to login" });
    }
  }
);

// Rota de buscar usuário por ID
server.get(
  "/users/:id",
  async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const userId = Number(request.params.id);

    if (isNaN(userId)) {
      return reply.status(400).send({ error: "Invalid userId" });
    }

    try {
      const user = await prisma.user.findUnique({ where: { id: userId } });

      if (!user) {
        return reply.status(404).send({ error: "Usuário não encontrado" });
      }

      return reply.send(user);
    } catch (error) {
      console.error(error);
      return reply.status(500).send({ error: "Failed to fetch user" });
    }
  }
);

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
      console.error("Error creating property:", error);
      return reply.status(500).send({ error: "Falha ao criar imóvel" });
    }
  }
);

// Rota para listar imóveis
server.get(
  "/property",
  async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const imoveis = await prisma.property.findMany({
        include: { images: true },
      });
      return reply.send(imoveis);
    } catch (error) {
      console.error("Erro ao buscar imóveis:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
  }
);

// Rota para listar imóveis de um usuário específico
server.get(
  "/property/user",
  async (
    request: FastifyRequest<{ Querystring: { userId: string } }>,
    reply: FastifyReply
  ) => {
    const { userId } = request.query;

    const numericUserId = Number(userId); // Converte userId para número

    if (isNaN(numericUserId)) {
      return reply
        .status(400)
        .send({ error: "UserId é obrigatório e deve ser um número" });
    }

    try {
      const imoveis = await prisma.property.findMany({
        where: { userId: numericUserId },
        include: { images: true },
      });

      if (imoveis.length === 0) {
        return reply
          .status(404)
          .send({ message: "Nenhum imóvel encontrado para este usuário" });
      }

      return reply.send(imoveis);
    } catch (error) {
      console.error("Erro ao buscar imóveis do usuário:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóveis" });
    }
  }
);

// Rota para obter detalhes de um imóvel específico
server.get(
  "/imoveis/:id",
  async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    console.log("ID recebido:", id); // Log para verificar o ID
    console.log("Fetching property with ID:", id);

    const propertyId = Number(id);
    if (isNaN(propertyId)) {
      return reply.status(400).send({ error: "ID deve ser um número válido" });
    }

    try {
      console.log("Buscando imóvel com ID:", propertyId); // Log do ID que será buscado
      const property = await prisma.property.findUnique({
        where: {
          id: propertyId,
        },
        include: { images: true },
      });

      if (!property) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      return reply.send(property);
    } catch (error) {
      console.error("Erro ao buscar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao buscar imóvel" });
    }
  }
);

// Rota para editar um imóvel
server.put(
  "/property/:id",
  async (
    request: FastifyRequest<{ Params: { id: string }; Body: PropertyRequest }>,
    reply: FastifyReply
  ) => {
    const { id } = request.params;
    const { title, description, latitude, longitude, userId } = request.body; // Inclua userId aqui

    // Validação do ID do imóvel
    const propertyId = Number(id);
    if (isNaN(propertyId)) {
      return reply
        .status(400)
        .send({ error: "ID do imóvel deve ser um número" });
    }

    // Validação dos dados do imóvel
    const { error } = propertySchema.validate({
      title,
      description,
      latitude,
      longitude,
      userId,
    }); // Inclua userId na validação
    if (error) {
      return reply.status(400).send({ error: error.details[0].message });
    }

    try {
      // Verifica se o imóvel existe antes de tentar editar
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
      });
      if (!existingProperty) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      // Atualiza o imóvel
      const property = await prisma.property.update({
        where: { id: propertyId },
        data: {
          title,
          description,
          latitude,
          longitude,
        },
        include: { images: true },
      });

      return reply.status(200).send(property);
    } catch (error) {
      console.error("Erro ao editar imóvel:", error);
      return reply.status(500).send({ error: "Falha ao editar imóvel" });
    }
  }
);

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
      // Verifica se o imóvel existe antes de tentar deletar
      const existingProperty = await prisma.property.findUnique({
        where: { id: propertyId },
        include: { images: true }, // Inclui as imagens para verificar se existem
      });

      if (!existingProperty) {
        return reply.status(404).send({ error: "Imóvel não encontrado" });
      }

      // Deleta todas as imagens associadas ao imóvel
      await prisma.image.deleteMany({ where: { propertyId: propertyId } });

      // Deleta o imóvel
      await prisma.image.delete({ where: { id: propertyId } });

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
